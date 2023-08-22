const jwt = require('jsonwebtoken');
const logger = require('./logger');
const config = require('./config');
const User = require('../models/user');

const unknownEndpoint = (request, response) => {
  response.status(404).send({ error: 'unknown endpoint' });
};

const errorHandler = (error, request, response, next) => {
  logger.error(error.message);

  if (error.name === 'CastError') {
    return response.status(400).send({ error: 'malformatted id' });
  } else if (error.name === 'ValidationError') {
    return response.status(400).json({ error: error.message });
  } else if (error.name === 'JsonWebTokenError') {
    return response.status(401).json({ error: 'JWT invalid' });
  } else if (error.name === 'TokenExpiredError') {
    return response.status(401).json({ error: 'JWT expired' });
  }
  next(error);
};

const tokenExtractor = (request, response, next) => {
  try {
    const authorization = request.get('authorization');
    if (authorization && authorization.startsWith('Bearer ')) {
      request.token = authorization.replace('Bearer ', '');
    } else {
      request.token = null;
    }
    next();
  } catch (error) {
    next(error);
  }
};

const userExtractor = async (request, response, next) => {
  try {
    const decodedToken = jwt.verify(request.token, config.SECRET);
    if (!decodedToken.id) {
      response.status(401).json({
        error: 'JWT invalid',
      });
    }

    request.user = await User.findById(decodedToken.id);

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  unknownEndpoint,
  errorHandler,
  tokenExtractor,
  userExtractor,
};
