echo 'starting app with WEBKIT_DISABLE_DMABUF_RENDERER=1 via pnpm'
cd /home/remcostoeten/dev/skriuw-standalone/app/ && env WEBKIT_DISABLE_DMABUF_RENDERER=1 pnpm tauri:dev
