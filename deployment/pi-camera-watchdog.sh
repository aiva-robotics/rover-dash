#!/bin/bash
# pi-camera-watchdog.sh
# Övervakar kameraströmmen och startar om pi-camera om den hänger sig.
# Körs av systemd (pi-camera-watchdog.service).

set -u

HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8080/health}"
SERVICE_NAME="${SERVICE_NAME:-pi-camera}"

CHECK_INTERVAL=5            # Sekunder mellan kontroller
FAIL_THRESHOLD=3            # Misslyckade kontroller innan omstart (3x5s = 15s)
RESTART_COOLDOWN=60         # Minsta tid mellan omstarter
CURL_TIMEOUT=4              # Timeout per hälsokontroll

fail_count=0
last_restart=0

log() { echo "[watchdog] $(date '+%H:%M:%S') $*"; }

log "Startar övervakning av $SERVICE_NAME ($HEALTH_URL)"
log "Tröskel: $FAIL_THRESHOLD misslyckanden à ${CHECK_INTERVAL}s = ~$((FAIL_THRESHOLD * CHECK_INTERVAL))s utan ström"

while true; do
    if ! systemctl is-active --quiet "$SERVICE_NAME"; then
        log "VARNING: $SERVICE_NAME körs inte – försöker starta den"
        systemctl restart "$SERVICE_NAME" || log "FEL: kunde inte starta $SERVICE_NAME"
        sleep "$RESTART_COOLDOWN"
        fail_count=0
        continue
    fi

    if curl -sf --max-time "$CURL_TIMEOUT" "$HEALTH_URL" > /dev/null 2>&1; then
        if [ "$fail_count" -gt 0 ]; then
            log "OK igen efter $fail_count misslyckade kontroller"
        fi
        fail_count=0
    else
        fail_count=$((fail_count + 1))
        log "Hälsokontroll misslyckades ($fail_count/$FAIL_THRESHOLD)"
    fi

    if [ "$fail_count" -ge "$FAIL_THRESHOLD" ]; then
        now=$(date +%s)
        elapsed=$((now - last_restart))
        if [ "$elapsed" -lt "$RESTART_COOLDOWN" ]; then
            log "Väntar på cooldown (${elapsed}s < ${RESTART_COOLDOWN}s) innan ny omstart"
        else
            log "STRÖMMEN NERE – startar om $SERVICE_NAME"
            systemctl restart "$SERVICE_NAME" && log "Omstart lyckades" || log "FEL: omstart misslyckades"
            last_restart=$(date +%s)
            fail_count=0
            # Ge kameran tid att initiera innan nästa kontroll
            sleep 10
        fi
    fi

    sleep "$CHECK_INTERVAL"
done
