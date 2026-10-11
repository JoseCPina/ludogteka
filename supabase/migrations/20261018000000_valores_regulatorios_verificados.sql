-- Veterinaria, Fase 4 · parte 11: valores regulatorios verificados contra los textos originales
-- (Acuerdo SENASICA DOF 12-07-2004 y su modificación DOF 05-03-2012, Ley General de Salud consolidada
-- con reformas al 15-01-2026 y la FAQ oficial del SITPV de 07-09-2026). Cada valor guarda su fuente
-- (texto y URL) y la fecha de verificación (2026-10-09). Lo que sigue «por confirmar» se queda así y
-- la plataforma lo ve. Los productos del inventario copian la clasificación al elegir el principio
-- activo y guardan la suya: corregir el catálogo NO cambia el candado de un producto ya registrado.

alter table public.principios_activos add column fuente_url text, add column verificado_at date;
alter table public.vet_reglas add column fuente_url text, add column verificado_at date;
alter table public.vet_reglas_clasificacion add column fuente_url text, add column verificado_at date;

create temp table _pa_nuevos (nombre text, grupo text, lgs text, am boolean, pc boolean, nota text, antes text, fuente text, url text) on commit drop;
insert into _pa_nuevos values
('tiletamina', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('zolazepam', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('propofol', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('xilazina', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('medetomidina', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('detomidina', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('propiopromazina', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('haloperidol', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('droperidol', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('azaperona', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('isoflurano', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('halotano', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('enflurano', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('metoxiflurano', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('óxido nitroso', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('lidocaína', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('bupivacaína', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('mepivacaína', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('procaína', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('tetracaína', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('succinilcolina', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('pancuronio', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('metocarbamol', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('doxapram', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('naltrexona', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('tiafentanil', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('testosterona', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('estradiol', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('progesterona', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('medroxiprogesterona', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('megestrol', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('altrenogest', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('dinoprost', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('cloprostenol', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('buserelina', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('gonadotropinas', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('vincristina', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('mercaptopurina', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('tiopental', 'I', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('acepromazina', 'I', NULL, false, false, NULL, 'acepromacina', 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('clorpromazina', 'I', NULL, false, false, NULL, 'clorpromacina', 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('ketamina', 'I', 'psicotropico_245_III', false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012); Ley General de Salud (consolidada, reformas al 15-ene-2026)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/ https://www.diputados.gob.mx/LeyesBiblio/pdf/LGS.pdf https://www.diputados.gob.mx/LeyesBiblio/ref/lgs/LGS_ref141_15ene26.pdf'),
('diazepam', 'I', 'psicotropico_245_III', false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012); Ley General de Salud (consolidada, reformas al 15-ene-2026)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/ https://www.diputados.gob.mx/LeyesBiblio/pdf/LGS.pdf https://www.diputados.gob.mx/LeyesBiblio/ref/lgs/LGS_ref141_15ene26.pdf'),
('midazolam', 'I', 'psicotropico_245_III', false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012); Ley General de Salud (consolidada, reformas al 15-ene-2026)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/ https://www.diputados.gob.mx/LeyesBiblio/pdf/LGS.pdf https://www.diputados.gob.mx/LeyesBiblio/ref/lgs/LGS_ref141_15ene26.pdf'),
('lorazepam', 'I', 'psicotropico_245_III', false, true, 'Clasificación LGS fr. III por confirmar.', NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012); Ley General de Salud (consolidada, reformas al 15-ene-2026)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/ https://www.diputados.gob.mx/LeyesBiblio/pdf/LGS.pdf https://www.diputados.gob.mx/LeyesBiblio/ref/lgs/LGS_ref141_15ene26.pdf'),
('pentobarbital', 'I', 'psicotropico_245_II', false, false, 'Art. 245 fr. II; por el art. 250 sigue el régimen de estupefacientes.', NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012); Ley General de Salud (consolidada, reformas al 15-ene-2026)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/ https://www.diputados.gob.mx/LeyesBiblio/pdf/LGS.pdf https://www.diputados.gob.mx/LeyesBiblio/ref/lgs/LGS_ref141_15ene26.pdf'),
('butorfanol', 'I', 'psicotropico_245_II', false, false, 'Art. 245 fr. II; por el art. 250 sigue el régimen de estupefacientes.', NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012); Ley General de Salud (consolidada, reformas al 15-ene-2026)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/ https://www.diputados.gob.mx/LeyesBiblio/pdf/LGS.pdf https://www.diputados.gob.mx/LeyesBiblio/ref/lgs/LGS_ref141_15ene26.pdf'),
('fentanilo', 'I', 'estupefaciente_234', false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012); Ley General de Salud (consolidada, reformas al 15-ene-2026)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/ https://www.diputados.gob.mx/LeyesBiblio/pdf/LGS.pdf https://www.diputados.gob.mx/LeyesBiblio/ref/lgs/LGS_ref141_15ene26.pdf'),
('meperidina', 'I', 'estupefaciente_234', false, true, 'Clasificación LGS art. 234 por confirmar.', NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012); Ley General de Salud (consolidada, reformas al 15-ene-2026)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/ https://www.diputados.gob.mx/LeyesBiblio/pdf/LGS.pdf https://www.diputados.gob.mx/LeyesBiblio/ref/lgs/LGS_ref141_15ene26.pdf'),
('amoxicilina', 'II', NULL, true, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('ampicilina', 'II', NULL, true, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('cefalexina', 'II', NULL, true, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('cefalotina', 'II', NULL, true, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('ceftiofur', 'II', NULL, true, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('ceftriaxona', 'II', NULL, true, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('doxiciclina', 'II', NULL, true, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('oxitetraciclina', 'II', NULL, true, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('tetraciclina', 'II', NULL, true, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('enrofloxacina', 'II', NULL, true, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('ciprofloxacina', 'II', NULL, true, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('clindamicina', 'II', NULL, true, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('lincomicina', 'II', NULL, true, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('eritromicina', 'II', NULL, true, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('tilosina', 'II', NULL, true, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('gentamicina', 'II', NULL, true, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('amikacina', 'II', NULL, true, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('neomicina', 'II', NULL, true, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('trimetoprim', 'II', NULL, true, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('sulfonamidas', 'II', NULL, true, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('florfenicol', 'II', NULL, true, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('trimetoprim-sulfa', 'II', NULL, true, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('metronidazol', 'II', NULL, true, false, 'Autorizado solo en perros, gatos, caballos y fauna. No es Grupo I.', NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('cloranfenicol', 'II', NULL, true, true, 'Autorizado en animales de compañía; prohibido en animales de consumo. Grupo por confirmar.', NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('ketoconazol', 'II', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('itraconazol', 'II', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('fluconazol', 'II', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('griseofulvina', 'II', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('meloxicam', 'II', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('carprofeno', 'II', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('ketoprofeno', 'II', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('flunixina', 'II', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('dipirona', 'II', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('diclofenaco', 'II', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('piroxicam', 'II', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('dexametasona', 'II', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('prednisolona', 'II', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('metilprednisolona', 'II', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('betametasona', 'II', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('triamcinolona', 'II', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('insulina', 'II', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('oxitocina', 'II', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('furosemida', 'II', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('albendazol', 'II', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('fenbendazol', 'II', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('praziquantel', 'II', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('pirantel', 'II', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('antihistamínicos (en general)', 'II', NULL, false, false, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('ivermectina', 'II', NULL, false, false, 'También Grupo III en presentación oral para perro y gato.', NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('tramadol', NULL, 'psicotropico_245_III', false, true, 'Sin grupo en el Acuerdo; depende del registro del producto. Fr. III del art. 245 en vigor desde 14-jul-2026.', NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012); Ley General de Salud (consolidada, reformas al 15-ene-2026)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/ https://www.diputados.gob.mx/LeyesBiblio/pdf/LGS.pdf https://www.diputados.gob.mx/LeyesBiblio/ref/lgs/LGS_ref141_15ene26.pdf'),
('fenobarbital', NULL, 'psicotropico_245_IV', false, true, 'Sin grupo en el Acuerdo; depende del registro del producto.', NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012); Ley General de Salud (consolidada, reformas al 15-ene-2026)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/ https://www.diputados.gob.mx/LeyesBiblio/pdf/LGS.pdf https://www.diputados.gob.mx/LeyesBiblio/ref/lgs/LGS_ref141_15ene26.pdf'),
('buprenorfina', NULL, 'estupefaciente_234', false, true, 'Sin grupo en el Acuerdo; depende del registro del producto.', NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012); Ley General de Salud (consolidada, reformas al 15-ene-2026)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/ https://www.diputados.gob.mx/LeyesBiblio/pdf/LGS.pdf https://www.diputados.gob.mx/LeyesBiblio/ref/lgs/LGS_ref141_15ene26.pdf'),
('morfina', NULL, 'estupefaciente_234', false, true, 'Sin grupo en el Acuerdo; depende del registro del producto.', NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012); Ley General de Salud (consolidada, reformas al 15-ene-2026)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/ https://www.diputados.gob.mx/LeyesBiblio/pdf/LGS.pdf https://www.diputados.gob.mx/LeyesBiblio/ref/lgs/LGS_ref141_15ene26.pdf'),
('nalbufina', NULL, 'psicotropico_245_II', false, true, 'Sin grupo en el Acuerdo; depende del registro del producto. Por el art. 250 sigue el régimen de estupefacientes.', NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012); Ley General de Salud (consolidada, reformas al 15-ene-2026)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/ https://www.diputados.gob.mx/LeyesBiblio/pdf/LGS.pdf https://www.diputados.gob.mx/LeyesBiblio/ref/lgs/LGS_ref141_15ene26.pdf'),
('dexmedetomidina', NULL, NULL, false, true, 'Sin grupo en el Acuerdo; depende del registro del producto.', NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('gabapentina', NULL, NULL, false, true, 'Sin grupo en el Acuerdo; depende del registro del producto.', NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('trazodona', NULL, NULL, false, true, 'Sin grupo en el Acuerdo; depende del registro del producto.', NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('fluoxetina', NULL, NULL, false, true, 'Sin grupo en el Acuerdo; depende del registro del producto.', NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('metadona', NULL, NULL, false, true, 'Sin grupo en el Acuerdo; depende del registro del producto.', NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('sevoflurano', NULL, NULL, false, true, 'Sin grupo en el Acuerdo; depende del registro del producto.', NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('fipronil', NULL, NULL, false, true, 'Sin grupo en el Acuerdo; depende del registro del producto.', NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('marbofloxacina', NULL, NULL, true, true, 'Sin grupo en el Acuerdo; depende del registro del producto.', NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/'),
('codeína', NULL, 'estupefaciente_234', false, true, NULL, NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012); Ley General de Salud (consolidada, reformas al 15-ene-2026)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/ https://www.diputados.gob.mx/LeyesBiblio/pdf/LGS.pdf https://www.diputados.gob.mx/LeyesBiblio/ref/lgs/LGS_ref141_15ene26.pdf'),
('alprazolam', NULL, 'psicotropico_245_III', false, true, 'LGS fr. III. Sin grupo en el Acuerdo.', NULL, 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012); Ley General de Salud (consolidada, reformas al 15-ene-2026)', 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/555911/ https://www.diputados.gob.mx/LeyesBiblio/pdf/LGS.pdf https://www.diputados.gob.mx/LeyesBiblio/ref/lgs/LGS_ref141_15ene26.pdf');

update public.principios_activos p
   set nombre = n.nombre, grupo_senasica = n.grupo, clasificacion_lgs = n.lgs, es_antimicrobiano = n.am, por_confirmar = n.pc,
       nota = n.nota, fuente = n.fuente, fuente_url = n.url, verificado_at = date '2026-10-09'
  from _pa_nuevos n
 where p.deleted_at is null and lower(p.nombre) = lower(coalesce(n.antes, n.nombre));

insert into public.principios_activos (nombre, grupo_senasica, clasificacion_lgs, es_antimicrobiano, por_confirmar, nota, fuente, fuente_url, verificado_at)
select n.nombre, n.grupo, n.lgs, n.am, n.pc, n.nota, n.fuente, n.url, date '2026-10-09'
  from _pa_nuevos n
 where not exists (select 1 from public.principios_activos p where p.deleted_at is null and lower(p.nombre) = lower(n.nombre));

-- Los que no están en la lista verificada conservan su valor y quedan sin fecha de verificación.
update public.principios_activos
   set fuente = 'Acuerdo DOF 12-jul-2004 (mod. DOF 05-mar-2012); sin verificar contra el texto', fuente_url = 'https://www.gob.mx/cms/uploads/attachment/file/555908/'
 where deleted_at is null and verificado_at is null;

-- Reglas generales: fuente, URL y fecha.
update public.vet_reglas set
    verificado_at = date '2026-10-09',
    fuente_url = case clave
      when 'receta_conservacion_meses' then 'https://www.gob.mx/cms/uploads/attachment/file/555908/'
      when 'receta_conservacion_grupo_i_meses' then 'https://www.gob.mx/cms/uploads/attachment/file/555908/'
      when 'lgs_tratamiento_max_dias' then 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LGS.pdf'
      when 'sitpv_url' then 'https://prod.senasica.gob.mx/sitpv/ingresar'
      else 'https://www.gob.mx/cms/uploads/attachment/file/1102120/PREGUNTAS_FRECUENTES_SITPV_13-08.pdf' end,
    fuente = case clave
      when 'receta_copias' then 'FAQ oficial del SITPV (07-sep-2026): el SITPV imprime original y 2 copias; NOM-064-ZOO-2000 (original y 2 copias)'
      when 'receta_conservacion_meses' then 'Acuerdo SENASICA DOF 12-jul-2004 (mod. 05-mar-2012) y NOM-064-ZOO-2000: Grupo II, original y 2 copias, 6 meses'
      when 'receta_conservacion_grupo_i_meses' then 'Acuerdo SENASICA DOF 12-jul-2004 (mod. 05-mar-2012) y NOM-064-ZOO-2000: Grupo I, copia de la receta cuantificada, 1 año'
      when 'lgs_tratamiento_max_dias' then 'Ley General de Salud, arts. 240 y 241 (tratamiento de estupefacientes de máximo 30 días)'
      when 'sitpv_bloque_folios' then 'FAQ oficial del SITPV (07-sep-2026): folios de 50 en 50'
      when 'sitpv_meses_sin_reporte_bloqueo' then 'FAQ oficial del SITPV (07-sep-2026): sin reportes de los últimos 3 meses no hay folios nuevos'
      when 'leyenda_uso_hospitalario' then 'FAQ oficial del SITPV (07-sep-2026): leyenda «USO HOSPITALARIO» + nombre de la clínica'
      when 'leyenda_parcialidades' then 'FAQ oficial del SITPV (07-sep-2026): «se ocupará en parcialidades» en observaciones'
      when 'sitpv_url' then 'Dirección de ingreso al SITPV (SENASICA)'
    end
 where clave in ('receta_copias', 'receta_conservacion_meses', 'receta_conservacion_grupo_i_meses', 'lgs_tratamiento_max_dias', 'sitpv_bloque_folios',
                 'sitpv_meses_sin_reporte_bloqueo', 'leyenda_uso_hospitalario', 'leyenda_parcialidades', 'sitpv_url');
update public.vet_reglas set valor = '"https://prod.senasica.gob.mx/sitpv/ingresar"'::jsonb,
       descripcion = 'A dónde manda el botón «Abrir el SITPV en otra pestaña».'
 where clave = 'sitpv_url';
insert into public.vet_reglas (clave, valor, titulo, descripcion, fuente, orden, fuente_url, verificado_at) values
  ('sitpv_url_registro', '"https://prod.senasica.gob.mx/sitpv/registrarse"', 'Dirección del registro en el SITPV', 'Para que un médico nuevo se dé de alta en el SITPV.',
   'Dirección de registro del SITPV (SENASICA)', 150, 'https://prod.senasica.gob.mx/sitpv/registrarse', date '2026-10-09');
-- Criterio de PeluDesk (no sale de un texto oficial): sin fecha de verificación.
update public.vet_reglas set fuente = 'Criterio de PeluDesk', fuente_url = null, verificado_at = null
 where clave in ('sitpv_folios_alerta', 'sitpv_reporte_dia_recordatorio', 'sitpv_reporte_dia_aviso', 'leyenda_uso_veterinario', 'leyenda_espejo');

-- Clasificaciones: fuente, URL y fecha.
update public.vet_reglas_clasificacion set verificado_at = date '2026-10-09',
    fuente_url = case clave
      when 'senasica_I' then 'https://www.gob.mx/cms/uploads/attachment/file/555908/ https://www.gob.mx/cms/uploads/attachment/file/1102120/PREGUNTAS_FRECUENTES_SITPV_13-08.pdf'
      when 'senasica_II' then 'https://www.gob.mx/cms/uploads/attachment/file/555908/'
      when 'senasica_III' then 'https://www.gob.mx/cms/uploads/attachment/file/555908/'
      when 'antimicrobiano' then 'https://www.gob.mx/cms/uploads/attachment/file/555908/'
      when 'antimicrobiano_espejo' then 'https://www.gob.mx/cms/uploads/attachment/file/1102120/PREGUNTAS_FRECUENTES_SITPV_13-08.pdf'
      else 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LGS.pdf https://www.diputados.gob.mx/LeyesBiblio/ref/lgs/LGS_ref141_15ene26.pdf' end,
    fuente = case clave
      when 'senasica_I' then 'Acuerdo SENASICA DOF 12-jul-2004 (mod. 05-mar-2012): receta cuantificada, venta exclusiva a MVZ con cédula; FAQ del SITPV (07-sep-2026): se emite en el SITPV con la CPA del MVZ'
      when 'senasica_II' then 'Acuerdo SENASICA DOF 12-jul-2004 (mod. 05-mar-2012): receta simple de MVZ con cédula; NOM-064-ZOO-2000: original y 2 copias, 6 meses'
      when 'senasica_III' then 'Acuerdo SENASICA DOF 12-jul-2004 (mod. 05-mar-2012): libre venta'
      when 'antimicrobiano' then 'Acuerdo SENASICA DOF 12-jul-2004 (mod. 05-mar-2012): los antimicrobianos son Grupo II'
      when 'antimicrobiano_espejo' then 'FAQ oficial del SITPV (07-sep-2026): la receta cuantificada de antimicrobianos en el SITPV es opcional (prueba piloto)'
      when 'estupefaciente_234' then 'Ley General de Salud, arts. 234 y 240-242: recetario especial con código de barras, tratamiento de máximo 30 días; el MVZ está autorizado cuando prescribe para animales (art. 240 fr. II); el establecimiento que surte lleva libro de contabilidad (art. 242)'
      when 'psicotropico_245_II' then 'Ley General de Salud, art. 245 fr. II y art. 250 (régimen de estupefacientes); arts. 240-242'
      when 'psicotropico_245_III' then 'Ley General de Salud, art. 245 fr. III y art. 251: receta con cédula, se surte una sola vez y se retiene'
      when 'psicotropico_245_IV' then 'Ley General de Salud, art. 245 fr. IV y art. 252: receta con cédula, hasta 3 surtidos en 6 meses'
      else fuente end;
