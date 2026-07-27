import pngToIco from 'png-to-ico';
import { readFile, writeFile } from 'fs/promises';

const input = './icon.png';
const output = './icon.ico';

try {
  const buffer = await readFile(input);
  const ico = await pngToIco(buffer);
  await writeFile(output, ico);
  console.log('icon.ico creado correctamente');
} catch (err) {
  console.error(err);
}