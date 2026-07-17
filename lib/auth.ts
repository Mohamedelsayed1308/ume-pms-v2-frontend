export function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('token') : null;
}

export function getUser() {
  if (typeof window === 'undefined') return null;
  const u = localStorage.getItem('user');
  return u ? JSON.parse(u) : null;
}

export function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login';
}

export function isLoggedIn() {
  return !!getToken();
}
