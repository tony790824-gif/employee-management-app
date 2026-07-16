import { cp, mkdir, rm } from 'node:fs/promises';
import { deployFiles } from './project-files.mjs';

const outputDirectory = 'dist';

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const file of deployFiles) {
  await cp(file, `${outputDirectory}/${file}`);
}

console.log(`建置完成：${deployFiles.length} 個檔案已輸出至 ${outputDirectory}/。`);

