const mongoose = require('mongoose');
const supertest = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const helper = require('./test_helper');
const config = require('../utils/config');

const api = supertest(app);

beforeEach(async () => {
  await helper.resetDb();
});

describe('BLOGS', () => {
  describe('GET /api/blogs', () => {
    test('returns all blogs in json format', async () => {
      const response = await api
        .get('/api/blogs')
        .expect(200)
        .expect('Content-Type', /application\/json/);
      expect(response.body).toHaveLength(helper.data.blogs.length);
    });

    test('contains specific blog', async () => {
      const response = await api.get('/api/blogs');
      const titles = response.body.map((blog) => blog.title);
      expect(titles).toContain(helper.data.blogs[0].title);
    });

    test('every blog contains id property', async () => {
      const response = await api.get('/api/blogs');
      response.body.forEach((blog) => expect(blog.id).toBeDefined());
    });
  });

  describe('POST /api/blogs', () => {
    const checkBlogCreation = async (request, expectedStatus, authData) => {
      const response = await api
        .post('/api/blogs')
        .set('Authorization', authData ? `Bearer ${authData.token}` : '')
        .send(request)
        .expect(expectedStatus)
        .expect('Content-Type', /application\/json/);

      if (expectedStatus === 400) return {};

      const blog = await helper.getBlogFromDb(response.body.id);
      expect(blog).toBeDefined();

      const user = await helper.getUserFromDb(authData.user.username);
      expect(blog.user.toString()).toBe(user._id.toString());
      expect(user.blogs.map((blog) => blog._id.toString())).toContain(
        blog._id.toString()
      );

      return { blog, user };
    };

    describe('creates a valid blog', () => {
      test('when given a valid request', async () => {
        const authData = await helper.getUserAuthData(
          helper.data.users[0].username
        );

        const blogRequest = {
          title: 'Valid blog post',
          url: 'http://www.somerandomblogurl.om',
          likes: 1,
          user: authData.user._id.toString(),
        };

        await checkBlogCreation(blogRequest, 201, authData);
      });

      test('when a request is missing [likes] property', async () => {
        const authData = await helper.getUserAuthData(
          helper.data.users[0].username
        );

        const blogRequest = {
          title: 'Blog missing likes property',
          author: 'Test Dummy',
          url: 'http://www.somerandomblogurl.com',
          user: authData.user._id.toString(),
        };

        const { blog } = await checkBlogCreation(blogRequest, 201, authData);
        if (blog) {
          expect(blog.likes).toBe(0);
        }
      });
    });

    describe('fails to create blog', () => {
      test('when a request is missing a [title] property', async () => {
        const authData = await helper.getUserAuthData(
          helper.data.users[0].username
        );

        const blogRequest = {
          author: 'Test Dummy',
          url: 'http://www.somerandomblogurl.com',
          likes: 5,
          user: authData.user._id.toString(),
        };

        await checkBlogCreation(blogRequest, 400, authData);

        const blogs = await helper.blogsInDb();
        expect(blogs).toHaveLength(helper.data.blogs.length);
      });

      test('when a request is missing a [url] property', async () => {
        const authData = await helper.getUserAuthData(
          helper.data.users[0].username
        );

        const blogRequest = {
          title: 'Blog missing url property',
          author: 'Test Dummy',
          likes: 5,
          user: authData.user._id.toString(),
        };

        await checkBlogCreation(blogRequest, 400, authData);

        const blogs = await helper.blogsInDb();
        expect(blogs).toHaveLength(helper.data.blogs.length);
      });
    });
  });

  describe('DELETE /api/blogs/:id', () => {
    const checkBlogDeletion = async (id, code, authData, success = true) => {
      await api
        .delete(`/api/blogs/${id}`)
        .set('Authorization', authData ? `Bearer ${authData.token}` : '')
        .expect(code);

      const seedLength = helper.data.blogs.length;
      const expectedLength = success ? seedLength - 1 : seedLength;

      const blogs = await helper.blogsInDb();
      expect(blogs).toHaveLength(expectedLength);
    };

    describe('successfully removes blog', () => {
      test('when given a valid existing id', async () => {
        const authData = await helper.getUserAuthData(
          helper.data.users[1].username
        );

        const validId = authData.user.blogs[0];
        await checkBlogDeletion(validId, 204, authData);
      });
    });

    describe('fails to remove a blog', () => {
      test('when given an invalid id', async () => {
        const authData = await helper.getUserAuthData(
          helper.data.users[1].username
        );

        const invalidId = '---invalid-fomat---';
        await checkBlogDeletion(invalidId, 400, authData, false);
      });

      test('when given non-existent id', async () => {
        const authData = await helper.getUserAuthData(
          helper.data.users[1].username
        );

        const nonExistentId = await helper.getNonExistentId();
        await checkBlogDeletion(nonExistentId, 204, authData, false);
      });

      test('that does not belong to a user', async () => {
        const authData = await helper.getUserAuthData(
          helper.data.users[1].username
        );
        const blogs = await helper.blogsInDb();
        const id = await blogs.find(
          (blog) => blog.user.toString() !== authData.user._id.toString()
        ).id;

        await checkBlogDeletion(id, 401, authData, false);
      });

      test('of an unauthenticated user', async () => {
        const authData = await helper.getUserAuthData(
          helper.data.users[1].username
        );

        const validId = authData.user.blogs[0];
        await checkBlogDeletion(validId, 401, null, false);
      });
    });
  });

  describe('PUT /api/blogs/:id', () => {
    test('successfully updates existing blog and ignores additional properties', async () => {
      let id = await helper.getExistingId();
      const blogBefore = await helper.getBlogFromDb(id);

      let blogUpdates = {
        title: 'update',
        additional: 'should-not-contain-this',
      };

      await api
        .put(`/api/blogs/${id}`)
        .send(blogUpdates)
        .expect(200)
        .expect('Content-Type', /application\/json/);

      const blogAfter = await helper.getBlogFromDb(id);

      expect(blogAfter.title).toBe(blogUpdates.title);

      expect(blogAfter.author).toBe(blogBefore.author);
      expect(blogAfter.url).toBe(blogBefore.url);
      expect(blogAfter.likes).toBe(blogBefore.likes);

      expect(blogAfter.additional).toBeUndefined();
    });

    test('fails to update on validation fail', async () => {
      let id = await helper.getExistingId();
      const blogBefore = await helper.getBlogFromDb(id);

      let blogUpdates = {
        title: '',
      };

      await api.put(`/api/blogs/${id}`).send(blogUpdates).expect(400);

      const blogAfter = await helper.getBlogFromDb(id);

      expect(blogAfter).toStrictEqual(blogBefore);
    });

    test('fails to update non-existent blog', async () => {
      const blogsBefore = await helper.blogsInDb();

      let id = await helper.getNonExistentId();
      let blogUpdates = {
        title: 'update',
        additional: 'should-not-contain-this',
      };

      await api.put(`/api/blogs/${id}`).send(blogUpdates).expect(404);

      const blogsAfter = await helper.blogsInDb();

      blogsAfter.forEach((blog, idx) => {
        expect(blog).toStrictEqual(blogsBefore[idx]);
      });
    });
  });

  describe('USERS', () => {
    describe('GET /api/users', () => {
      test('returns all users in json format', async () => {
        const response = await api
          .get('/api/users')
          .expect(200)
          .expect('Content-Type', /application\/json/);

        expect(response.body).toHaveLength(helper.data.users.length);
      });
    });

    describe('POST /api/users', () => {
      describe('creates new user', () => {
        test('when given a valid request', async () => {
          const userRequest = {
            username: 'uniqueName',
            name: 'Unique Test Dummy',
            password: 'veryStrongPassword123',
          };

          await api
            .post('/api/users')
            .send(userRequest)
            .expect(201)
            .expect('Content-Type', /application\/json/);

          const users = await helper.usersInDb();
          expect(users).toHaveLength(helper.data.users.length + 1);
          expect(users.map((user) => user.username)).toContain(
            userRequest.username
          );
        });
      });

      describe('fails to create new user', () => {
        const checkFailureToAddUser = async (request, code) => {
          await api
            .post('/api/users')
            .send(request)
            .expect(code)
            .expect('Content-Type', /application\/json/);

          const users = await helper.usersInDb();
          expect(users).toHaveLength(helper.data.users.length);
        };

        test('when request is missing a username', async () => {
          const userRequest = {
            name: 'Unique Test Dummy',
            password: 'veryStrongPassword123',
          };

          await checkFailureToAddUser(userRequest, 400);
        });

        test('when request is missing a password', async () => {
          const userRequest = {
            username: 'uniqueName',
            name: 'Unique Test Dummy',
          };

          await checkFailureToAddUser(userRequest, 400);
        });

        test('when username is baddly formatted', async () => {
          const userRequest = {
            username: 'un',
            name: 'Unique Test Dummy',
            password: 'veryStrongPassword123',
          };

          await checkFailureToAddUser(userRequest, 400);
        });

        test('when password is baddly formatted', async () => {
          const userRequest = {
            username: 'uniqueName',
            name: 'Unique Test Dummy',
            password: 've',
          };

          await checkFailureToAddUser(userRequest, 400);
        });

        test('when given non unique username', async () => {
          const userRequest = {
            username: helper.data.users[0].username,
            name: 'Unique Test Dummy',
            password: 'veryStrongPassword123',
          };

          await checkFailureToAddUser(userRequest, 400);
        });
      });
    });
  });

  describe('LOGIN', () => {
    describe('POST /api/login', () => {
      describe('returns a [valid JWT]', () => {
        test('when given valid existing username and password', async () => {
          const loginRequest = {
            username: helper.data.users[0].username,
            password: helper.data.users[0].password,
          };
          const { body } = await api
            .post('/api/login')
            .send(loginRequest)
            .expect(200)
            .expect('Content-Type', /application\/json/);

          const { token, username, name } = body;

          expect(username).toBe(helper.data.users[0].username);
          expect(name).toBe(helper.data.users[0].name);
          expect(token).toBeDefined();

          const user = await helper.getUserFromDb(username);
          const userInfo = {
            id: user._id.toString(),
            username: user.username,
          };

          const testToken = jwt.sign(userInfo, config.SECRET, {
            expiresIn: 3600,
          });

          expect(token).toBe(testToken);
        });
      });

      describe('returns [401 unauthorized]', () => {
        const checkFailsToLogin = async (request, status) => {
          await api
            .post('/api/login')
            .send(request)
            .expect(status)
            .expect('Content-Type', /application\/json/);
        };

        test('when given non-existent username', async () => {
          const loginRequest = {
            username: 'nonExistent',
            password: 'whoCares',
          };
          await checkFailsToLogin(loginRequest, 401);
        });

        test('when given wrong password', async () => {
          const loginRequest = {
            username: helper.data.users[0].username,
            password: 'wrongPassword123',
          };
          await checkFailsToLogin(loginRequest, 401);
        });

        test('when given empty request body', async () => {
          await checkFailsToLogin({}, 401);
        });
      });
    });
  });
});

afterAll(async () => {
  await mongoose.connection.close();
});
