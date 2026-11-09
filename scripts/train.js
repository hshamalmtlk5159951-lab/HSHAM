import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(root, 'data/training.jsonl');
const output = path.join(root, 'data/knowledge.json');

try {
  const lines = (await fs.readFile(source, 'utf8')).split(/\r?\n/).filter(line => line.trim());
  const docs = lines.map((line, index) => {
    let item;
    try { item = JSON.parse(line); } catch { throw new Error(`Invalid JSON on line ${index + 1}`); }
    if (typeof item.content !== 'string' || !item.content.trim()) throw new Error(`Line ${index + 1} needs a non-empty "content" field.`);
    return { title: String(item.title || `معلومة ${index + 1}`).slice(0, 120), content: item.content.trim().slice(0, 4000) };
  });
  await fs.writeFile(output, `${JSON.stringify(docs, null, 2)}\n`);
  console.log(`XENAI knowledge base built: ${docs.length} entries → data/knowledge.json`);
  console.log('This builds a searchable knowledge base; it does not fine-tune or train the provider foundation model.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
