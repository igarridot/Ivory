# Ivory

Webapp personal de piano en español, preparada para iPad y Casio AP-300. Biblioteca incluida, curso por etapas y uso local. Primera release pública: `v0.1.0`. No requiere instalar paquetes npm para ejecutar la aplicación; la dependencia ZIP está incluida con su licencia.

## Docker Compose y Make

Desde la raíz del repositorio:

```sh
make up       # Construye y arranca en segundo plano
make down     # Detiene los contenedores; conserva las partituras
make build    # Reconstruye la imagen
make test     # Comprueba la sintaxis y ejecuta las pruebas con Node local
make logs     # Sigue los logs
```

Abre `http://127.0.0.1:5173` en Chrome o Edge en el Mac. Se conserva el mismo origen utilizado antes, por lo que el progreso previo del navegador sigue disponible. El piano se conecta al navegador del Mac; no hay que pasar Bluetooth o USB al contenedor.

El `Dockerfile` usa la imagen oficial `node:24-alpine` y no necesita paquetes npm adicionales. `make up` crea la carpeta de datos y pasa el UID/GID del usuario del host al contenedor para escribir en ella sin cambiar su propietario. La raíz del contenedor es de solo lectura; la carpeta de subidas se monta con escritura.

Para usar Compose directamente, prepara la carpeta y los permisos de usuario:

```sh
mkdir -p data/uploads
IVORY_UID="$(id -u)" IVORY_GID="$(id -g)" docker compose up -d --build
docker compose down
```

`compose.yaml` no crea automáticamente la carpeta del host, para evitar que quede con propietario root. Puedes cambiar el puerto con `IVORY_PORT=5180 make up` o mediante `.env`; hay un `.env.example`. El puerto publicado se limita a `127.0.0.1` para uso en el Mac. El servidor HTTPS para iPad se puede ejecutar directamente con Node siguiendo la sección correspondiente.

Si solo tienes Docker y quieres ejecutar las pruebas dentro de una imagen:

```sh
docker build --target test -t ivory-piano:test .
```

El target `test` incluye OpenSSL y ejecuta las mismas comprobaciones que `make test`.

## GitHub Actions y Docker Hub

El contenido de esta carpeta es la raíz de [igarridot/Ivory](https://github.com/igarridot/Ivory). No hay una carpeta `ivory/` adicional dentro del repositorio.

- **Tests**: se ejecuta al abrir una PR, actualizar sus commits, reabrirla o marcarla como lista. También admite ejecución manual y se reutiliza antes de cada release. Prueba Node.js 24, la imagen Alpine, el contenedor y el bind mount en runners nativos **amd64** y **arm64**.
- **Release**: se ejecuta al actualizar `main`, después de superar las pruebas de ambas arquitecturas. Calcula una versión semántica, publica la imagen Docker multi-arquitectura, verifica su manifiesto y crea la tag y la release de GitHub. La primera versión es `v0.1.0`; las siguientes incrementan el patch automáticamente. Una revisión de `main` sustituida por otra más reciente no se publica.
- Desde Actions → Release → Run workflow se puede lanzar manualmente y elegir incremento `patch`, `minor` o `major`. Si la revisión ya tiene una tag semántica, se reutiliza para que un reintento no genere otra versión.

La imagen se publica por defecto en **`norbega/ivory`**, con etiquetas `0.1.0`, `v0.1.0` y `latest` para la primera release, y plataformas `linux/amd64` y `linux/arm64`. `latest` se actualiza al terminar la publicación de la release. La variable de repositorio `DOCKERHUB_IMAGE` permite cambiar el nombre de la imagen.

Los secrets de Actions requeridos en **Ivory** son `DOCKER_USERNAME` y `DOCKER_PASSWORD` (una contraseña o, preferiblemente, un token de Docker Hub con permiso de escritura en esa imagen). Se utilizan los mismos nombres que Pentaract, pero GitHub mantiene los valores separados por repositorio. Nunca se guardan en el código ni en `.env.example`.

```sh
docker pull norbega/ivory:0.1.0
# Ejecución manual de la release desde GitHub CLI:
gh workflow run release.yml --repo igarridot/Ivory --ref main -f bump=patch
```

Los workflows de PR no reciben credenciales de Docker Hub ni permisos de escritura. Las acciones externas están fijadas a commits verificados. La tag se crea en el mismo workflow que publica la imagen, evitando depender de que una tag creada con `GITHUB_TOKEN` dispare otro workflow.

## Almacenamiento de partituras subidas

El bind mount de Compose es **`./data/uploads:/app/data/uploads`**, relativo al directorio que contiene este README y `compose.yaml`. El almacenamiento queda en `data/uploads/` dentro del clon del repositorio.

Cada nueva subida conserva el archivo original y los datos musicales:

```text
data/uploads/
  import-<identificador>/
    Sonate_No._14_Moonlight_1st_Movement.mxl
    score.json
```

La API escribe en una carpeta temporal y la renombra al terminar para evitar registros parciales. Los archivos permanecen tras `make down`, recrear el contenedor o reconstruir la imagen. No están dentro de la imagen ni se guardan en un volumen anónimo. La carpeta está excluida de Git y del contexto de construcción de Docker.

También `npm run dev` y `npm run dev:https` usan esta carpeta por defecto. Se puede indicar otra mediante `IVORY_UPLOADS_DIR` para ejecución directa. La biblioteca se lee desde el servidor al arrancar: las partituras subidas quedan accesibles desde otros navegadores que abran esa misma instancia. La app mantiene una caché IndexedDB para practicar con sus notas sin conexión; una subida nueva necesita conexión con el servidor local y confirma el guardado solo tras escribir en disco.

Las importaciones de versiones anteriores se migran automáticamente desde localStorage conservando sus identificadores y puntos de práctica. Como esas versiones no conservaban el archivo fuente, la migración guarda `score.json` con `normalizedOnly: true`; para conservar también el MXL/XML/MIDI original hay que volver a subirlo. Las copias JSON restauradas siguen la misma regla, y nunca sobrescriben un original que ya esté guardado.

El progreso y las preferencias siguen siendo propios de cada navegador. Para una copia completa, conserva `data/uploads/` y exporta el progreso JSON desde la app. La exportación JSON contiene los datos musicales, pero no los binarios originales.

## Reiniciar progreso

Cada elemento de **Tocar** tiene un botón «Reiniciar progreso» que elimina su mejor resultado, sus sesiones terminadas y su punto de práctica. Conserva las otras piezas, las lecciones y el tiempo total practicado.

Cada elemento de **Aprender** tiene su propio botón para marcar la lección como pendiente, sin borrar el progreso de los ejercicios vinculados.

En **Conexión → 04 · Conserva tu camino** está «Restablecer progreso global»: elimina lecciones completadas, sesiones, resultados, puntos de práctica, tiempo acumulado y rachas del navegador actual. Conserva las partituras subidas y todas las preferencias. Los tres tipos de reinicio requieren confirmación y permiten cancelar.

## Ejecutar y verificar sin Docker

Para ejecución directa requiere Node.js 24 o posterior. Las pruebas de TLS requieren también OpenSSL. Para ejecutar en contenedor, instala Docker con Compose. Esas pruebas generan un certificado temporal y no instalan confianza en el sistema.

```sh
npm run dev
npm run check
npm test
```

Abre `http://127.0.0.1:5173` en el mismo ordenador que ejecuta el servidor. Los navegadores que ofrecen Web MIDI pueden considerar seguro el acceso HTTP por loopback (`localhost` o `127.0.0.1`), sin certificado. Esa excepción no se aplica a la IP del ordenador vista desde el iPad. Además, `npm run dev` escucha solo en loopback y no es accesible desde otro dispositivo.

### iPad desde la red local

Para alojar Ivory en un ordenador de casa y abrirla en el iPad, utiliza HTTPS y un certificado que el iPad reconozca como válido. El servidor local ya está preparado; los certificados y la confianza del dispositivo se configuran aparte. HTTPS no añade soporte MIDI a Safari: sigue siendo necesario MIDIWeb u otro navegador con esa capacidad.

1. Instala [mkcert](https://github.com/FiloSottile/mkcert) en el ordenador. En macOS puedes usar `brew install mkcert`.
2. Desde la raíz del repositorio, genera un certificado. Sustituye `192.168.1.50` por la IP de tu ordenador en la red doméstica:

   ```sh
   mkdir -p .certs
   mkcert -cert-file .certs/server.pem -key-file .certs/server-key.pem localhost 127.0.0.1 ::1 192.168.1.50
   mkcert -CAROOT
   ```

3. Transfiere **solo `rootCA.pem`**, de la carpeta que indica el último comando, al iPad. Instala su perfil y activa la confianza en esa CA en Ajustes → General → Información → Ajustes de confianza de los certificados. [Instrucciones de Apple](https://support.apple.com/en-us/102390). No transfieras `rootCA-key.pem` ni `server-key.pem`.
4. Inicia el servidor:

   ```sh
   npm run dev:https
   ```

5. Conecta ambos dispositivos a la misma red y abre `https://192.168.1.50:5443` en MIDIWeb. Si el sistema pregunta, permite conexiones entrantes al proceso Node en la red doméstica. El certificado debe incluir exactamente la IP o el nombre que uses para entrar. Si quieres verificarlo también en el navegador del ordenador, instala allí la CA con `mkcert -install`.

El servidor escucha en las interfaces IPv4 del ordenador, sirve los recursos de `dist/` y ofrece la API de subidas. Los datos de `data/uploads/` solo se leen mediante la API; no se publican como una carpeta estática. No abre puertos en el router ni utiliza un túnel de Internet. Puede limitarse a una interfaz con `npm run dev:https -- --host 192.168.1.50`; admite también `--port`, `--cert` y `--key`.

Para que el progreso siga disponible, conserva la misma dirección y puerto. Es recomendable reservar la IP en el router. Cambiar de origen (IP/nombre, protocolo o puerto) crea un almacenamiento distinto: exporta e importa una copia de Ivory para migrarlo.

Un certificado autofirmado sin confianza instalada no resuelve el requisito. Si prefieres no instalar una CA en el iPad, necesitaríamos otra vía: por ejemplo, un dominio propio con certificado de una CA pública y resolución hacia el servidor local. Esa configuración requiere dominio, DNS y renovación, y no está implementada. La URL privada publicada anteriormente es una alternativa alojada fuera de la red local; su TLS lo gestiona el proveedor, pero no es alojamiento exclusivamente local.

La configuración de confianza y el funcionamiento real de MIDIWeb en el iPad quedan pendientes de validar. No se ha instalado ninguna CA ni modificado la confianza del sistema al preparar este servidor.

## Funciones actuales

- Inicio personalizado y objetivo diario de 90 minutos, ajustable a 30, 60, 90 o 120.
- 40 lecciones organizadas en ocho etapas: iniciación, cimientos, lenguaje musical, independencia, polifonía, técnica avanzada, interpretación y preparación profesional.
- 37 ejercicios originales, con instrucciones y objetivos; los nuevos estudios enlazan con su lección.
- Tema claro, oscuro o según el sistema, con preferencia persistente y botón en la barra superior.
- Las 69 partituras de musetrainer/library incluidas en archivos locales, con búsqueda, autor, paginación y filtros de etapa para los ejercicios.
- Notas descendentes, teclado táctil y entrada por teclado del ordenador.
- Modo de espera y modo de ritmo, práctica por manos, tempo de 20 a 200 BPM, fragmentos por compases, repetición, metrónomo y demostración sin puntuación.
- Entrada MIDI con selección de dispositivo, notas, velocidad de pulsación y estado del pedal. No se solicita SysEx y no se envían órdenes al piano.
- Importación local de MXL comprimido, MusicXML `score-partwise` sin comprimir y MIDI estándar de formato 0 o 1, hasta 5 MB y 20.000 notas desplegadas. Se conserva el enlace de procedencia si se añade.
- MXL: lectura de `META-INF/container.xml`, selección del archivo principal, validación de tamaños/rutas y checksum CRC; el XML descomprimido se limita a 30 MB por entrada. No se extraen archivos al disco.
- Repeticiones simples y casillas desplegadas, cambios de compás, anacrusas, voces, acordes, ligaduras de prolongación y grupos irregulares con compensación de redondeo.
- Aviso y adaptación opcional por octavas de notas fuera de las 88 teclas del AP-300; se conserva el archivo original. Los unísonos simultáneos se reúnen para que una tecla no exija dos ataques a la vez.
- Partituras personales persistentes en la carpeta local del servidor, descarga de originales, caché para práctica sin conexión y migración de importaciones anteriores.
- Reinicio independiente por pieza y lección, más reinicio global con confirmación y conservación de partituras.
- Guardado local de resultados, lecciones y posición de práctica: notas acertadas y omitidas, tempo, modo, manos, fragmento y posición temporal. Al volver se continúa en pausa.
- Exportación JSON e importación de copias para conservar el progreso o cambiar de navegador. La restauración combina lecciones, partituras y sesiones por identificador; para el tiempo diario conserva el mayor valor de cada día, por lo que no suma tiempos de dispositivos distintos.
- Recordatorios de descanso por bloques de 20, 25 o 30 minutos. Se cuenta práctica durante reproducción activa y hasta 60 segundos desde la última pulsación; escuchar demostraciones no suma tiempo.
- Manifest y service worker que precargan la aplicación y las 69 partituras. Se ha verificado la recarga y la apertura de repertorio sin red en Chromium después de completar esa primera carga. En iPad/MIDIWeb físico sigue pendiente de validación.

## iPad y conexión real

Safari no expone Web MIDI de forma nativa; instalar esta web como PWA no resuelve esa limitación. El usuario ha aceptado probar MIDIWeb Browser, una app de terceros que expone Web MIDI y un panel de Bluetooth MIDI. Debe abrir la URL de Ivory en ese navegador. La combinación física iPad Pro M5, versión concreta de iPadOS, MIDIWeb y WU-BT10 todavía necesita validación.

1. Insertar WU-BT10 en el puerto USB-A del AP-300 y activar la función inalámbrica.
2. Desde el panel de Bluetooth MIDI del navegador, conectar `WU-BT10 MIDI`.
3. En Ivory → Conexión, permitir acceso MIDI y seleccionar la entrada.
4. Comprobar teclas, acordes, liberaciones y pedal.
5. Escuchar el sonido directamente en el piano o en auriculares conectados a él. Evitar enrutar la interpretación por audio Bluetooth.

El audio Bluetooth es independiente. Casio advierte de posibles inestabilidades al combinarlo con BLE MIDI. La alternativa es USB-B con un cable de datos apropiado para el iPad; sigue siendo necesario un navegador con acceso MIDI.

Ivory pausa y guarda al ocultar la página o desconectarse la entrada. Permite reconectar manualmente; no promete reconexión automática del adaptador. La compensación temporal es manual: un valor positivo descuenta retardo de entrada. No mide automáticamente el retardo ni elimina el jitter. En ritmo se usa una ventana aproximada de 220 ms, con un mínimo de 0,15 negras; no se evalúan duración de pulsación, calidad del pedal, postura ni digitación.

## Biblioteca incluida y archivos personales

Se han incorporado todos los archivos de `scores/` de [musetrainer/library](https://github.com/musetrainer/library) en el commit `9128876f6164d96997c877a2be843349a32bdabb`: **69 archivos MXL**, aproximadamente 1,4 MB comprimidos. Los originales se mantienen sin cambios en `dist/scores/`; el manifiesto conserva sus hashes SHA-256 y enlaces de procedencia. No se eliminan los arreglos o versiones alternativas.

El repertorio se carga bajo demanda desde esos archivos locales; sus notas no se duplican en localStorage. Así, la colección no consume la cuota de almacenamiento del progreso. Los títulos y autores proceden del MusicXML y pueden estar incompletos. La dificultad del repertorio no se asigna automáticamente.

Moonlight ya tiene versiones incluidas, entre ellas `Sonate_No._14_Moonlight_1st_Movement.mxl`. Se ha probado su subida, el guardado del original en disco, su descarga y su apertura para practicar. Si el MusicXML no incluye título, se utiliza el nombre del archivo.

Nothing Else Matters e Interstellar siguen como objetivos que requieren un arreglo autorizado. Los 37 ejercicios de Ivory son originales. No se han descargado partituras de MuseScore: su flujo continúa siendo importar archivos obtenidos mediante las opciones permitidas del servicio.

El repositorio de origen se presenta como biblioteca de dominio público; Ivory conserva la procedencia y no certifica los derechos de cada arreglo. La fuente y la revisión se documentan en `dist/scores/SOURCE.txt`.

## Alcance de la ruta de aprendizaje

Las ocho etapas ofrecen explicaciones, preguntas, laboratorios y estudios desde cero hasta la preparación de trabajo de repertorio profesional. Se mantienen los identificadores de las lecciones originales, el formato del progreso y sus copias para conservar los avances previos.

Completar el curso o lograr una puntuación MIDI no acredita un nivel profesional. Lectura con pentagrama, balance, digitación, postura, interpretación y repertorio completo necesitan práctica adicional y revisión por un profesor o mentor. Las actividades avanzadas incluyen objetivos auditivos, análisis, grabaciones externas y colaboración real; la app no finge evaluar automáticamente esas capacidades.

## Límites actuales

- El progreso se conserva en el almacenamiento de este navegador y origen, sin cuenta ni sincronización. No se comparte automáticamente entre Safari y MIDIWeb, entre dispositivos o entre el servidor local y la web desplegada. Borrar datos del sitio elimina el guardado; usar las copias JSON para migrar.
- La versión actual se desarrolla para uso local. El despliegue privado previo no se ha actualizado en esta tarea. Los archivos personales se guardan en el servidor local del usuario. El progreso se procesa en el navegador. No hay analítica ni envío de las partituras a servicios externos.
- No hay reproducción de partituras tradicionales grabadas en pentagrama. La lección de lectura es introductoria y la práctica usa notas descendentes.
- MusicXML: se omiten notas de gracia y no se desarrollan símbolos de adornos. Las repeticiones anidadas se practican una vez en orden escrito; los saltos D.C./D.S./coda no se ejecutan. Cada limitación presente en una partitura se avisa antes de practicar. El tempo de práctica es fijo y el pulso se expresa en negras, incluso con compases compuestos. Tras desplegar repeticiones, la numeración de práctica sigue el recorrido, no el compás impreso.
- MIDI: se ignora percusión del canal 10; manos divididas inicialmente en Do4 y ajustables por registro. No se infieren digitaciones ni una dificultad real. Los compases se calculan con la métrica del archivo; el tempo se normaliza para practicar.
- `.mscz`, PDF y reconocimiento de audio no están implementados. Exportar MXL o MusicXML desde un editor cuando sea necesario.
- Precisión = aciertos / (aciertos + pulsaciones extra). Cobertura = notas acertadas / notas del fragmento. Las notas omitidas reducen cobertura. Las estrellas evalúan un fragmento con su configuración, no el dominio de una pieza completa.
- No se ha validado la conexión con hardware ni en WebKit/iPadOS físico.

## Verificación realizada

`npm run check` comprueba la sintaxis de los módulos y scripts. `npm test` ejecuta 31 pruebas: el motor de práctica y MIDI, TLS local, integridad de los 69 archivos, límites ZIP, recorrido de repeticiones/casillas, compases variables, adaptación al rango del piano enlaces entre el curso y sus ejercicios, reinicios independientes/globales, persistencia de originales tras reiniciar el servidor, idempotencia, migración, validación de subidas, protección de rutas y cálculo de versiones de release. Las pruebas de TLS no instalan certificados en el sistema.

La comprobación de navegador usa un contexto aislado, sin tocar el progreso del perfil habitual. Con un navegador Chromium iniciado con un puerto de depuración local y el servidor en marcha:

```sh
node scripts/browser-qa.mjs
# Opcional: comprobar otro archivo MXL real
node scripts/browser-qa.mjs --sample /ruta/a/partitura.mxl
```

Opciones: `--cdp` (por defecto `http://127.0.0.1:9227`), `--url` (por defecto `http://127.0.0.1:5173/`) y `--artifacts` para informes y capturas.

Se han verificado el tema claro/oscuro y su persistencia, recuperación exacta de práctica, demostración sin pérdida de progreso, las 40 lecciones y filtros, subida/guardado en disco/descarga/apertura del MXL de Moonlight, reinicios por elemento y global con cancelación, migración del progreso anterior, **lectura de 69/69 partituras**, diseño a tamaños de ordenador/tablet/móvil, alineación de teclas y notas, y recarga/apertura del repertorio sin red. También se han repetido las pruebas de MIDI simulado y restauración de copias de la versión anterior. No equivale a una prueba con el piano ni en iPadOS físico.

## Fuentes técnicas

- [AP-300: especificaciones y adaptador incluido](https://www.casio.com/intl/electronic-musical-instruments/product.AP-300BK/).
- [Casio: conexión Bluetooth MIDI](https://support.casio.com/global/en/emi/manual/ap-300_s200_en/chap13-sec003.html).
- [Casio: conexión de audio Bluetooth](https://support.casio.com/global/en/emi/manual/ap-300_s200_en/chap13-sec004.html).
- [MDN: Web MIDI](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API).
- [MIDIWeb Browser: ficha en App Store](https://apps.apple.com/app/id6757226617).
- [MuseScore: condiciones, especialmente apartado 21](https://musescore.com/legal/terms).

- [Biblioteca MuseTrainer](https://github.com/musetrainer/library).
- [Formato contenedor MusicXML](https://www.w3.org/2021/06/musicxml40/container-reference/).
- [fflate 0.8.2, licencia MIT incluida](https://github.com/101arrowz/fflate/tree/v0.8.2).

La configuración local se ha validado con `docker compose config`, incluidos el bind mount relativo y el usuario del contenedor. GitHub Actions añade la construcción y la prueba del contenedor en runners con Docker para ambas arquitecturas; el servidor Node, la persistencia tras reinicio y las comprobaciones de navegador también se prueban directamente.

## Licencia

El código del proyecto utiliza la licencia Apache-2.0 del repositorio. La dependencia fflate conserva su licencia MIT en `dist/vendor/fflate.LICENSE`; la procedencia de las partituras se documenta en `dist/scores/SOURCE.txt`.
