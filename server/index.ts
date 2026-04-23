import app from './app.js';
import { env } from './env.js';

app.listen(env.port, '127.0.0.1', () => {
  console.log(`API ready on http://127.0.0.1:${env.port}`);
});
