FROM nginx:alpine
COPY index.html style.css app.js questions.js english-questions.js courses.js favicon.svg /usr/share/nginx/html/
COPY sources/ /usr/share/nginx/html/sources/
COPY data/ /usr/share/nginx/html/data/
