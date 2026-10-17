services:
  - type: web
    name: proposito-em-deus
    runtime: docker
    plan: free
    healthCheckPath: /health
    envVars:
      - key: DATA_DIR
        value: /app/data
      - key: PUBLIC_URL
        sync: false
      - key: VAPID_PUBLIC_KEY
        sync: false
      - key: VAPID_PRIVATE_KEY
        sync: false
      - key: SMTP_HOST
        sync: false
      - key: SMTP_PORT
        value: "587"
      - key: SMTP_USER
        sync: false
      - key: SMTP_PASS
        sync: false
      - key: SMTP_FROM
        sync: false
