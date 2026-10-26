#!/usr/bin/env bash
# Construye la imagen en el VPS y arranca una copia de prueba dentro de Umbrel, conectada a la base
# de datos real, sin instalar la app. Luego: ssh -N -L 18080:<ip de umbrel-docker>:18080 logiqd-vps
# y abre http://localhost:18080.   Para pararla:  ./dev/probar-en-vps.sh --parar
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${1:-}" = "--parar" ]; then
  ssh logiqd-vps 'docker exec umbrel-docker docker rm -f logiqd-ig-panel-test'
  exit 0
fi

tar --exclude=node_modules --exclude=dist -czf - . | ssh logiqd-vps '
  set -e
  rm -rf ~/build/logiqd-ig-panel && mkdir -p ~/build/logiqd-ig-panel
  tar -xzf - -C ~/build/logiqd-ig-panel
  cd ~/build/logiqd-ig-panel
  docker build -q --build-arg APP_VERSION=dev -t logiqd-ig-panel:dev .
  docker save logiqd-ig-panel:dev | docker exec -i umbrel-docker docker load
  docker exec umbrel-docker sh -c "docker rm -f logiqd-ig-panel-test >/dev/null 2>&1; docker run -d --name logiqd-ig-panel-test \
    --network umbrel_main_network --env-file /data/logiqd-services/ig-automation/panel.env \
    -p 18080:8080 --memory 256m logiqd-ig-panel:dev"
  echo "Copia de prueba en marcha en $(docker inspect umbrel-docker -f "{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}" | cut -d" " -f1):18080"
'
