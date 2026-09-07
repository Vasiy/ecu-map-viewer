# The viewer is a static page; the image only carries a server for it.
# python:alpine keeps one server implementation for both ways of running:
# `python3 serve.py` on a laptop and the same file in here.
FROM python:3.13-alpine

WORKDIR /app

COPY index.html serve.py ./
COPY css ./css
COPY js ./js
COPY vendor ./vendor

# a container has to listen on every interface to be reachable from outside;
# a local run stays on the loopback address (see serve.py)
ENV HOST=0.0.0.0 \
    PORT=8123 \
    DATA_DIR=/data

# the library lives outside the image; without a volume it is a fresh empty
# directory every time the container is recreated
VOLUME /data
RUN mkdir -p /data && chown nobody /data

# su-exec drops to nobody after the entrypoint has made the mounted library
# writable. Docker creates a missing bind-mount directory owned by root, and the
# chown above sits *underneath* that mount -- so ownership has to be fixed once
# the mount exists, which is the one thing that needs a moment of root.
RUN apk add --no-cache su-exec
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8123
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=2s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8123/index.html').read(1)"

CMD ["python3", "serve.py"]
