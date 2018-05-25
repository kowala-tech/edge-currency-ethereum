FROM node:9
ADD . /code
WORKDIR /code
CMD ["yarn"]
