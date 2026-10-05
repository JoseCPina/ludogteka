-- El bucket privado de masters también guarda el respaldo de la voz (mp3) y los
-- tiempos de cada grabación: las sesiones de la nube son efímeras, y sin esto
-- agregar la voz después (o volver a mezclar) obligaría a pagarla otra vez.
update storage.buckets
set allowed_mime_types = array['video/mp4', 'text/plain', 'text/csv', 'application/x-subrip', 'image/jpeg', 'application/json', 'audio/mpeg']
where id = 'tutoriales-masters';
