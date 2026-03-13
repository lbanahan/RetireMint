# Backend README

## MongoDB with Docker

The backend connects to:

`mongodb://localhost:27017/retiremint`

If the backend runs in Docker and MongoDB runs on your host machine, use:

`mongodb://host.docker.internal:27017/retiremint`

Use a named container and volume so data persists between restarts.

### 1. Start MongoDB with Docker Compose (recommended)

From repo root (`RetireMint/`):

```bash
docker compose up -d
```

### 2. Stop container(s) but keep volumes

```bash
docker compose down
```

### 3. Stop container(s) and delete volumes (full reset)

```bash
docker compose down -v
```

### 4. Create and run MongoDB container (manual alternative)

```bash
docker run -d \
  --name retiremint-mongo \
  -p 27017:27017 \
  -v retiremint-mongo-data:/data/db \
  -v retiremint-mongo-config:/data/configdb \
  mongo:7
```

### 5. Start existing container

```bash
docker start retiremint-mongo
```

### 6. Stop container

```bash
docker stop retiremint-mongo
```

### 7. Delete container (keep data volumes)

```bash
docker rm retiremint-mongo
```

### 8. Delete data volumes (permanently removes Mongo data)

```bash
docker volume rm retiremint-mongo-data
docker volume rm retiremint-mongo-config
```

### 9. Delete both container and volumes in one step

```bash
docker rm -f retiremint-mongo
docker volume rm retiremint-mongo-data
docker volume rm retiremint-mongo-config
```

### 10. Useful checks

```bash
docker ps
docker ps -a
docker volume ls
docker logs -f retiremint-mongo
```

### 11. Open a Mongo shell (optional)

Use shell inside the running container (no local mongosh install required):

```bash
docker exec -it retiremint-mongo mongosh
```

Use locally installed `mongosh` against the mapped host port:

```bash
mongosh mongodb://localhost:27017
```
