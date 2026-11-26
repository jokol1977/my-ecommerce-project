#!/bin/sh
set -eu

if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx
else
    nginx -t
    exit 1
fi
