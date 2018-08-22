FROM node:10

ADD . /code
WORKDIR /code

CMD ["yarn"]
