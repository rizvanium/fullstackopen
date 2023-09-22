import Authors from './components/Authors';
import FilteredBooks from './components/FilteredBooks';
import RecommendedBooks from './components/RecommendedBooks';
import LoginForm from './components/LoginForm';
import NewBook from './components/NewBook';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { useApolloClient, useQuery } from '@apollo/client';
import { ME } from './queries';
import { useEffect, useState } from 'react';

const App = () => {
  const navigate = useNavigate();
  const client = useApolloClient();
  const meResponse = useQuery(ME);

  if (meResponse.loading) {
    return <div>...loading</div>;
  }
  const me = meResponse.data.me;
  const logout = () => {
    localStorage.clear();
    client.resetStore();
    navigate('/');
  };

  const navLoggedIn = () => (
    <>
      <button onClick={() => navigate('/books/new')}>add book</button>
      <button onClick={() => navigate('/recommended')}>recommended</button>
      <button onClick={logout}>logout</button>
    </>
  );

  const navLoggedOut = () => (
    <button onClick={() => navigate('/login')}>login</button>
  );

  return (
    <div>
      <header>
        <nav>
          <button onClick={() => navigate('/')}>authors</button>
          <button onClick={() => navigate('/books')}>books</button>
          {me ? navLoggedIn() : navLoggedOut()}
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Authors />} />
          <Route path="/books" element={<FilteredBooks />} />
          {me && <Route path="/books/new" element={<NewBook />} />}
          {me && (
            <Route
              path="/recommended"
              element={<RecommendedBooks genre={me.favoriteGenre} />}
            />
          )}
          {!me && <Route path="/login" element={<LoginForm />} />}
        </Routes>
      </main>
    </div>
  );
};

export default App;
