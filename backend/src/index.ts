import express from 'express';
import type { Request, Response } from 'express';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT;

app.use(express.json());

app.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'success',
    message: 'Express Is Running',
  });
});

app.listen(PORT, () => {
  console.log('Hello World');
});

const pesan = 'Halo Dunia';

console.log(pesan);

const variabelNganggur = 'Aku tidak pernah dipakai';
