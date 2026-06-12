-- =====================================================================
-- RECOMENDAI - NOTEBOOK CATEGORY MIGRATION & SEEDING SQL
-- Run this in your Supabase SQL Editor AFTER the main migration script.
-- =====================================================================

-- =====================================================================
-- CONFIGURAÇÃO DE RLS PARA TESTES (Execute isto no SQL Editor do Supabase)
-- =====================================================================
-- Se você quiser apenas desabilitar as restrições para facilitar os testes locais:
ALTER TABLE categorias DISABLE ROW LEVEL SECURITY;
ALTER TABLE criterios DISABLE ROW LEVEL SECURITY;
ALTER TABLE alternativas DISABLE ROW LEVEL SECURITY;
ALTER TABLE consequencias DISABLE ROW LEVEL SECURITY;

-- OU, se preferir manter o RLS ativo mas permitir operações (CRUD) para usuários autenticados:
-- DROP POLICY IF EXISTS "Permitir tudo para autenticados" ON categorias;
-- CREATE POLICY "Permitir tudo para autenticados" ON categorias FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- DROP POLICY IF EXISTS "Permitir tudo para autenticados" ON criterios;
-- CREATE POLICY "Permitir tudo para autenticados" ON criterios FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- DROP POLICY IF EXISTS "Permitir tudo para autenticados" ON alternativas;
-- CREATE POLICY "Permitir tudo para autenticados" ON alternativas FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- DROP POLICY IF EXISTS "Permitir tudo para autenticados" ON consequencias;
-- CREATE POLICY "Permitir tudo para autenticados" ON consequencias FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- =====================================================================


-- 1. Ensure a unique constraint exists on criterios (nome, categoria_id)
ALTER TABLE criterios ADD CONSTRAINT unique_nome_categoria UNIQUE (nome, categoria_id);

-- 2. Ensure a unique constraint exists on alternativas (marca, modelo, categoria_id)
ALTER TABLE alternativas ADD CONSTRAINT unique_marca_modelo_categoria UNIQUE (marca, modelo, categoria_id);

-- 3. Insert the Notebook category
INSERT INTO categorias (nome, icone) 
VALUES ('Notebook', 'laptop')
ON CONFLICT (nome) DO NOTHING;

-- 4. Seed dynamic data for Notebooks
DO $$
DECLARE
    cat_id UUID;
    crit_preco_id UUID;
    crit_ram_id UUID;
    crit_ssd_id UUID;
    crit_peso_id UUID;
    crit_bateria_id UUID;
    
    alt_lenovo_id UUID;
    alt_apple_id UUID;
    alt_dell_id UUID;
    alt_samsung_id UUID;
    alt_asus_id UUID;
BEGIN
    SELECT id INTO cat_id FROM categorias WHERE nome = 'Notebook';
    
    -- Insert Criteria for Notebooks
    INSERT INTO criterios (nome, direcao_padrao, direcao_editavel, tooltip, categoria_id)
    VALUES 
        ('Preço (R$)', 'min', true, 'Queremos pagar o menor valor possível. Notebooks de maior custo costumam ter acabamento premium.', cat_id),
        ('Memória RAM (GB)', 'max', false, 'Mais memória permite rodar muitos apps simultâneos sem engasgos.', cat_id),
        ('Armazenamento SSD (GB)', 'max', false, 'Mais espaço para fotos, vídeos e aplicativos.', cat_id),
        ('Peso (kg)', 'min', true, 'Mais leve e confortável de transportar na mochila.', cat_id),
        ('Bateria (horas)', 'max', false, 'Mais autonomia para trabalhar e estudar longe da tomada.', cat_id)
    ON CONFLICT (nome, categoria_id) DO NOTHING;
    
    -- Retrieve criteria IDs
    SELECT id INTO crit_preco_id FROM criterios WHERE nome = 'Preço (R$)' AND categoria_id = cat_id;
    SELECT id INTO crit_ram_id FROM criterios WHERE nome = 'Memória RAM (GB)' AND categoria_id = cat_id;
    SELECT id INTO crit_ssd_id FROM criterios WHERE nome = 'Armazenamento SSD (GB)' AND categoria_id = cat_id;
    SELECT id INTO crit_peso_id FROM criterios WHERE nome = 'Peso (kg)' AND categoria_id = cat_id;
    SELECT id INTO crit_bateria_id FROM criterios WHERE nome = 'Bateria (horas)' AND categoria_id = cat_id;

    -- Insert Alternatives (Products)
    INSERT INTO alternativas (marca, modelo, categoria_id)
    VALUES 
        ('Lenovo', 'ThinkPad L14', cat_id),
        ('Apple', 'MacBook Air M2', cat_id),
        ('Dell', 'Inspiron 15', cat_id),
        ('Samsung', 'Book Core i7', cat_id),
        ('ASUS', 'Zenbook OLED', cat_id)
    ON CONFLICT (marca, modelo, categoria_id) DO NOTHING;

    -- Retrieve alternative IDs
    SELECT id INTO alt_lenovo_id FROM alternativas WHERE marca = 'Lenovo' AND modelo = 'ThinkPad L14' AND categoria_id = cat_id;
    SELECT id INTO alt_apple_id FROM alternativas WHERE marca = 'Apple' AND modelo = 'MacBook Air M2' AND categoria_id = cat_id;
    SELECT id INTO alt_dell_id FROM alternativas WHERE marca = 'Dell' AND modelo = 'Inspiron 15' AND categoria_id = cat_id;
    SELECT id INTO alt_samsung_id FROM alternativas WHERE marca = 'Samsung' AND modelo = 'Book Core i7' AND categoria_id = cat_id;
    SELECT id INTO alt_asus_id FROM alternativas WHERE marca = 'ASUS' AND modelo = 'Zenbook OLED' AND categoria_id = cat_id;

    -- Insert Consequences (Specifications performance)
    -- Lenovo
    INSERT INTO consequencias (alternativa_id, criterio_id, valor) VALUES (alt_lenovo_id, crit_preco_id, 4500) ON CONFLICT (alternativa_id, criterio_id) DO UPDATE SET valor = EXCLUDED.valor;
    INSERT INTO consequencias (alternativa_id, criterio_id, valor) VALUES (alt_lenovo_id, crit_ram_id, 16) ON CONFLICT (alternativa_id, criterio_id) DO UPDATE SET valor = EXCLUDED.valor;
    INSERT INTO consequencias (alternativa_id, criterio_id, valor) VALUES (alt_lenovo_id, crit_ssd_id, 512) ON CONFLICT (alternativa_id, criterio_id) DO UPDATE SET valor = EXCLUDED.valor;
    INSERT INTO consequencias (alternativa_id, criterio_id, valor) VALUES (alt_lenovo_id, crit_peso_id, 1.6) ON CONFLICT (alternativa_id, criterio_id) DO UPDATE SET valor = EXCLUDED.valor;
    INSERT INTO consequencias (alternativa_id, criterio_id, valor) VALUES (alt_lenovo_id, crit_bateria_id, 8) ON CONFLICT (alternativa_id, criterio_id) DO UPDATE SET valor = EXCLUDED.valor;

    -- Apple
    INSERT INTO consequencias (alternativa_id, criterio_id, valor) VALUES (alt_apple_id, crit_preco_id, 8200) ON CONFLICT (alternativa_id, criterio_id) DO UPDATE SET valor = EXCLUDED.valor;
    INSERT INTO consequencias (alternativa_id, criterio_id, valor) VALUES (alt_apple_id, crit_ram_id, 8) ON CONFLICT (alternativa_id, criterio_id) DO UPDATE SET valor = EXCLUDED.valor;
    INSERT INTO consequencias (alternativa_id, criterio_id, valor) VALUES (alt_apple_id, crit_ssd_id, 256) ON CONFLICT (alternativa_id, criterio_id) DO UPDATE SET valor = EXCLUDED.valor;
    INSERT INTO consequencias (alternativa_id, criterio_id, valor) VALUES (alt_apple_id, crit_peso_id, 1.2) ON CONFLICT (alternativa_id, criterio_id) DO UPDATE SET valor = EXCLUDED.valor;
    INSERT INTO consequencias (alternativa_id, criterio_id, valor) VALUES (alt_apple_id, crit_bateria_id, 15) ON CONFLICT (alternativa_id, criterio_id) DO UPDATE SET valor = EXCLUDED.valor;

    -- Dell
    INSERT INTO consequencias (alternativa_id, criterio_id, valor) VALUES (alt_dell_id, crit_preco_id, 3200) ON CONFLICT (alternativa_id, criterio_id) DO UPDATE SET valor = EXCLUDED.valor;
    INSERT INTO consequencias (alternativa_id, criterio_id, valor) VALUES (alt_dell_id, crit_ram_id, 8) ON CONFLICT (alternativa_id, criterio_id) DO UPDATE SET valor = EXCLUDED.valor;
    INSERT INTO consequencias (alternativa_id, criterio_id, valor) VALUES (alt_dell_id, crit_ssd_id, 512) ON CONFLICT (alternativa_id, criterio_id) DO UPDATE SET valor = EXCLUDED.valor;
    INSERT INTO consequencias (alternativa_id, criterio_id, valor) VALUES (alt_dell_id, crit_peso_id, 1.8) ON CONFLICT (alternativa_id, criterio_id) DO UPDATE SET valor = EXCLUDED.valor;
    INSERT INTO consequencias (alternativa_id, criterio_id, valor) VALUES (alt_dell_id, crit_bateria_id, 6) ON CONFLICT (alternativa_id, criterio_id) DO UPDATE SET valor = EXCLUDED.valor;

    -- Samsung
    INSERT INTO consequencias (alternativa_id, criterio_id, valor) VALUES (alt_samsung_id, crit_preco_id, 4900) ON CONFLICT (alternativa_id, criterio_id) DO UPDATE SET valor = EXCLUDED.valor;
    INSERT INTO consequencias (alternativa_id, criterio_id, valor) VALUES (alt_samsung_id, crit_ram_id, 16) ON CONFLICT (alternativa_id, criterio_id) DO UPDATE SET valor = EXCLUDED.valor;
    INSERT INTO consequencias (alternativa_id, criterio_id, valor) VALUES (alt_samsung_id, crit_ssd_id, 512) ON CONFLICT (alternativa_id, criterio_id) DO UPDATE SET valor = EXCLUDED.valor;
    INSERT INTO consequencias (alternativa_id, criterio_id, valor) VALUES (alt_samsung_id, crit_peso_id, 1.7) ON CONFLICT (alternativa_id, criterio_id) DO UPDATE SET valor = EXCLUDED.valor;
    INSERT INTO consequencias (alternativa_id, criterio_id, valor) VALUES (alt_samsung_id, crit_bateria_id, 7) ON CONFLICT (alternativa_id, criterio_id) DO UPDATE SET valor = EXCLUDED.valor;

    -- ASUS
    INSERT INTO consequencias (alternativa_id, criterio_id, valor) VALUES (alt_asus_id, crit_preco_id, 6800) ON CONFLICT (alternativa_id, criterio_id) DO UPDATE SET valor = EXCLUDED.valor;
    INSERT INTO consequencias (alternativa_id, criterio_id, valor) VALUES (alt_asus_id, crit_ram_id, 16) ON CONFLICT (alternativa_id, criterio_id) DO UPDATE SET valor = EXCLUDED.valor;
    INSERT INTO consequencias (alternativa_id, criterio_id, valor) VALUES (alt_asus_id, crit_ssd_id, 1024) ON CONFLICT (alternativa_id, criterio_id) DO UPDATE SET valor = EXCLUDED.valor;
    INSERT INTO consequencias (alternativa_id, criterio_id, valor) VALUES (alt_asus_id, crit_peso_id, 1.3) ON CONFLICT (alternativa_id, criterio_id) DO UPDATE SET valor = EXCLUDED.valor;
    INSERT INTO consequencias (alternativa_id, criterio_id, valor) VALUES (alt_asus_id, crit_bateria_id, 11) ON CONFLICT (alternativa_id, criterio_id) DO UPDATE SET valor = EXCLUDED.valor;

END $$;
