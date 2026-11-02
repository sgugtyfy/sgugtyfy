FROM nginx:alpine
COPY index.html style.css app.js questions.js favicon.svg /usr/share/nginx/html/
COPY sources/ /usr/share/nginx/html/sources/
