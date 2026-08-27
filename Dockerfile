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
    PORT=8123

EXPOSE 8123
USER nobody

HEALTHCHECK --interval=30s --timeout=3s --start-period=2s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8123/index.html').read(1)"

CMD ["python3", "serve.py"]
