-- La marca de Ludogteka encima del diseño base de PeluDesk (docs/DISENO.md):
-- su logotipo "lu·dog·teka" (índigo, naranja, índigo; letra Fredoka) es el
-- mismo de su landing y de la rotulación de su camioneta
-- (src/components/landing/comunes.tsx, Marca). Con esto sale en el
-- encabezado del staff, su portal, su login y su alta por link en vez del
-- nombre en texto. Es su contenido de siempre, no un dato nuevo del negocio.
update public.negocios
set marca = coalesce(marca, '{}'::jsonb) || jsonb_build_object(
  'color', '#4458a7',
  'logo_fuente', 'fredoka',
  'logo_texto', jsonb_build_array(
    jsonb_build_object('texto', 'lu', 'color', '#4458a7'),
    jsonb_build_object('texto', 'dog', 'color', '#ef5025'),
    jsonb_build_object('texto', 'teka', 'color', '#4458a7')
  )
)
where id = '10000000-0000-4000-8000-000000000001';
