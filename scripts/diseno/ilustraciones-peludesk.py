# Ilustraciones de la landing de PeluDesk: de los paquetes de marca (Drive,
# carpeta "todos los paquetes", bajada con `gdown --folder` a marca-peludesk/,
# que no se versiona) a WebP recortado en 1x y 2x en public/peludesk/ilustraciones.
# Uso: python3 scripts/diseno/ilustraciones-peludesk.py   (requiere Pillow)
# Si cambia un tamaño, se cambia también ILUSTRACIONES en
# src/components/peludesk/ilustracion.tsx.
import glob
import os
from PIL import Image

B = "marca-peludesk/todos-los-paquetes/Peludesk_5_Paquetes"
DESTINO = "public/peludesk/ilustraciones"
SELECCION = {
    "escena-agenda": ("01_escena_agenda_citas", 560),
    "escena-bano": ("02_escena_bano_estetica", 560),
    "escena-hotel": ("03_escena_hotel_guarderia", 560),
    "escena-vacunas": ("04_escena_expediente_vacunas", 560),
    "chihuahua-asomandose": ("06_chihuahua_asomandose", 320),
    "xolo-sentado": ("02_xolo_sentado", 360),
    "laptop": ("01_xolo_y_chihuahua_en_laptop", 560),
    "calendario": ("02_chihuahua_senalando_calendario", 420),
    "clipboard": ("06_chihuahua_mostrando_clipboard", 420),
    "bano": ("03_chihuahua_banando_al_xolo", 420),
    "expediente": ("07_xolo_junto_a_expediente", 420),
    "durmiendo": ("05_xolo_y_chihuahua_durmiendo_juntos", 520),
    "fluffy-feliz": ("08_fluffy_feliz", 360),
    "chihuahua-feliz": ("10_chihuahua_feliz", 320),
    "huellitas": ("09_sendero_huellitas", 360),
    "corazon": ("10_corazon_con_trazo_decorativo", 200),
    "blob-lila": ("02_blob_lila", 600),
    "textura-menta": ("05_textura_suave_menta", 600),
}

os.makedirs(DESTINO, exist_ok=True)
for nombre, (archivo, ancho) in SELECCION.items():
    origen = glob.glob(f"{B}/**/{archivo}.png", recursive=True)[0]
    im = Image.open(origen).convert("RGBA")
    im = im.crop(im.getchannel("A").getbbox())
    for mult, sufijo in ((1, ""), (2, "@2x")):
        w = min(ancho * mult, im.width)
        h = round(im.height * w / im.width)
        im.resize((w, h), Image.LANCZOS).save(f"{DESTINO}/{nombre}{sufijo}.webp", "WEBP", quality=80, method=6)
    print(nombre, ancho, round(im.height * ancho / im.width))
