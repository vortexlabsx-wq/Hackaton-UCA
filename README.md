# Minimundos Elementales

Una aplicación web que usa la cámara, detecta a cada persona y crea a su alrededor un **reino elemental en 3D** elegido al azar entre agua, fuego, tierra y aire. Cada reino tiene un pueblo, criaturas y una unión con la persona.

Todo se procesa en el navegador: MediaPipe (segmentación y pose) y three.js (3D). Ninguna imagen sale del equipo.

## Cómo ejecutarlo

1. Doble clic en `iniciar.bat` (o `python servidor.py`). Usa este servidor y no `python -m http.server`: es el que deja que el editor guarde los pueblos y los .glb en la carpeta `models/`.
2. Abre http://localhost:8000 en Chrome o Edge.
3. Pulsa **Iniciar cámara** y elige la cámara en el selector (sirven las USB).
4. Ponte de cuerpo entero frente a la cámara.

**Demo sin cámara:** abre http://localhost:8000/demo3d.html. Simula una persona y tiene botones para cambiar de reino; sirve para presentar.

> Necesita internet la primera vez: descarga los modelos de MediaPipe, three.js, los modelos 3D y las texturas.

## Qué hace

| Reino | Pueblo | Criaturas |
|---|---|---|
| 🌿 Tierra | Casas con entramado de madera, molino, establo, pozo, árboles, pasto | Caballos, gólem de piedra, cigüeñas, loro |
| 🔥 Fuego | Casas de basalto, forja, torre de vigía, braseros, suelo de lava | Corceles de fuego, fénix, fuegos fatuos |
| 💧 Agua | Casas sobre pilotes, faro con haz giratorio, muelles | Serpiente marina enroscada en la persona, medusas, flamencos, cigüeñas |
| 🌪️ Aire | Torres blancas, molino, nubes, rocas flotantes | Loros, cigüeñas, flamencos, cintas de viento |

Así se une el reino con la persona:
- Los caminos llevan a una plaza a sus pies.
- Los aldeanos caminan hasta la plaza y algunos **suben por sus piernas**.
- Hay **casas sobre sus hombros**.
- El elemento **crece enroscado en sus piernas**: enredaderas, lava, agua o viento.
- Un **orbe del elemento** flota en su mano.

**Puente entre reinos.** Si dos personas se agarran de las manos o de los brazos durante unos 0,3 s, entre sus reinos se arma un **puente de madera en arco**. Crece desde los dos lados y se une justo debajo de las manos, y cada mitad brilla con el color de su reino. Por el puente cruzan un aldeano y un animal de cada reino (caballos, corceles de fuego, flamencos o loros): miran el otro pueblo y vuelven. Si se sueltan durante 1 s, las criaturas vuelven corriendo y el puente se repliega. Para verlo sin cámara, abre http://localhost:8000/demo3d.html?dos=1. Con `&el=` y `&el2=` eliges los reinos, y con `&ciclo=0` las personas no se sueltan nunca.

**Abrazo: mundos fusionados.** Si dos personas se abrazan durante medio segundo, sus reinos se achican y en el medio crece un **mundo único** que mezcla los dos elementos: el piso es mitad de cada uno y se funde en el centro, cada pueblo queda del lado de su persona, y lo recorren los animales de los dos reinos. Cada combinación tiene su nombre y su efecto:

| Combinación | Mundo | Efecto |
|---|---|---|
| 🔥 + 💧 | ♨️ Reino del Vapor | Géiseres de vapor y brasas |
| 🔥 + 🌿 | 🌋 Reino Volcánico | Brasas y ceniza |
| 💧 + 🌿 | 🌴 Reino de la Selva | Luciérnagas y bruma |
| 🔥 + 🌪️ | ☄️ Reino de la Tormenta de Fuego | Remolino de fuego alrededor de la pareja |
| 💧 + 🌪️ | ⛈️ Reino de la Tormenta | Lluvia y relámpagos |
| 🌿 + 🌪️ | 🏝️ Reino de las Islas Flotantes | Hojas en remolino |
| Mismo elemento | Gran Reino del … | El efecto de ese elemento, más fuerte |

El cuerpo de cada persona conserva lo suyo (enredaderas, orbe, casas en los hombros). Si se separan durante 1 s, el mundo fusionado se repliega y vuelven los dos reinos. Si la cámara pierde a una de las dos durante el abrazo, el mundo se mantiene unos segundos y la persona vuelve con su mismo elemento al reaparecer. Para verlo sin cámara: http://localhost:8000/demo3d.html?abrazo=1 (con `&el=` y `&el2=` eliges los reinos, y con `&ciclo=0` no se sueltan nunca).

## Editor de pueblos

Abre http://localhost:8000/editor.html (o el botón **🛠️ Editor de pueblos**) para armar a mano el pueblo de cada reino.

- Pestañas arriba para elegir el reino: 💧 Agua, 🔥 Fuego, 🌿 Tierra, 🌪️ Aire.
- **Agregar piezas**: casas, establo, molino, torres, forja, faro, árboles, arbustos, rocas, estanque o lava, pozo, faroles, braseros, cristales, murallas, cercas, caminos sueltos y la aldea de Blender completa. Elige una y haz clic en el piso. Con **Shift** sigues poniendo más.
- **Modelo propio (.glb)**: carga un modelo hecho en Blender. Se copia solo a la carpeta `models/` (y queda una copia en el navegador por las dudas). Los objetos que se llamen `door_N`, `chimney_N`, `waterwheel`, `flag` o `water…` funcionan igual que en la aldea: salen aldeanos, sale humo, la rueda gira y el agua se mueve.
- **Archivo de Blender (.blend)**: subí el `.blend` directo. El servidor abre Blender sin ventana (tiene que estar instalado), hornea los colores procedurales a texturas, saca luces, cámaras y humo volumétrico, y lo exporta a `models/<nombre>.glb`. Después se pone en el pueblo como cualquier modelo. Tarda de unos segundos a algunos minutos según el archivo. Si tu `.blend` usa imágenes externas, empaquetalas antes en Blender (**Archivo → Externos → Empaquetar recursos**). Además **optimiza el pueblo para que el juego vaya fluido**: une las piezas comunes en un solo objeto (los `door_N`, `chimney_N`, `waterwheel`, `flag` y `water…` quedan aparte), lo simplifica a unos 80 000 triángulos como máximo, lo hornea en una sola imagen y cambia el agua o vidrio con refracción por transparencia común (la refracción obliga al navegador a dibujar todo dos veces). El script es `blender/hornear_y_exportar.py`. Para ver cuánto pesa lo que se dibuja, mirá la línea **3D** del panel de diagnóstico: con dos personas conviene que quede por debajo de unos 300 mil triángulos.
- Para editar: **G** mueve, **R** rota y **S** escala (como en Blender). **Q/E** giran 15°, las flechas empujan la pieza, **Supr** borra, **Ctrl+D** duplica y **Ctrl+Z / Ctrl+Y** deshacen y rehacen. El panel derecho tiene los valores exactos.
- Las piezas con **Camino a la plaza** tienen un camino hasta los pies de la persona, y de ahí salen los aldeanos.
- La zona roja es lo que queda delante de la persona: lo que pongas ahí la tapa en el video.

**Cómo se guarda.** Cada cambio se guarda solo en `models/pueblo_<reino>.json` (por ejemplo `models/pueblo_fuego.json`) y la app y la demo lo usan enseguida, incluso con la app abierta en otra pestaña. Al abrir el editor otra vez aparece tal cual lo dejaste. Si la app no se abrió con `iniciar.bat`, se guarda solo en el navegador (el editor lo avisa con ⚠) y se pasa a `models/` la próxima vez que abras el editor con el servidor. **Descartar mis cambios** borra el pueblo de ese reino y vuelve el de siempre: la aldea de Blender en tierra y uno al azar en los otros reinos. **Exportar JSON** sirve para hacer una copia aparte, y **Exportar GLB** saca el pueblo como modelo 3D para seguir trabajándolo en Blender.

## Cómo funciona

1. **MediaPipe Image Segmenter** genera la máscara de la persona y **Pose Landmarker** sus 33 puntos del cuerpo.
2. Cada punto de la imagen se convierte a 3D, en un plano vertical a la profundidad de la persona. El piso del reino es horizontal, a la altura de sus pies.
3. Un **oclusor invisible** recortado con la máscara escribe profundidad en ese plano. Lo que está detrás de la persona queda tapado por su cuerpo y lo que está delante se dibuja encima.
4. three.js dibuja el reino con luces, sombras, materiales realistas, partículas y modelos animados. El resultado se pinta sobre el video.

## Archivos

- `index.html`, `style.css`, `app.js`: interfaz, cámara, detección y seguimiento de personas.
- `world3d.js`: motor 3D (reinos, pueblos, criaturas, unión con el cuerpo).
- `demo3d.html`: demo sin cámara.
- `editor.html`, `editor.js`: editor de pueblos en 3D.
- `servidor.py`: servidor local; sirve la app y guarda lo del editor en `models/`.
- `models/pueblo_<reino>.json`: pueblos diseñados en el editor (opcional).
- `version-2d/`: la versión anterior dibujada en 2D.

## Créditos

- Modelos 3D (caballo, flamenco, loro, cigüeña, soldado, robot) y texturas: ejemplos oficiales de [three.js](https://github.com/mrdoob/three.js/tree/dev/examples). Revisa sus licencias si el proyecto se va a publicar.
- Detección: [MediaPipe](https://developers.google.com/mediapipe).
