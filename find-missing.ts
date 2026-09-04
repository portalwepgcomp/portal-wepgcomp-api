import * as fs from 'fs';
import * as path from 'path';

function findMissingDecorators(dir: string) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      findMissingDecorators(fullPath);
    } else if (fullPath.endsWith('.dto.ts')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      let classStarted = false;
      let lastDecoratorLines = 0;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.includes('export class')) {
          classStarted = true;
          continue;
        }
        
        if (classStarted) {
          if (line.trim().startsWith('@')) {
            lastDecoratorLines = i;
          } else if (line.trim().match(/^[a-zA-Z0-9_]+\??\s*:/)) {
            // It's a property declaration
            if (lastDecoratorLines !== i - 1 && lastDecoratorLines !== i - 2 && lastDecoratorLines !== i - 3 && lastDecoratorLines !== i - 4) {
               // Check if the previous lines had a decorator
               let hasDecorator = false;
               for (let j = i - 1; j >= 0 && j >= i - 5; j--) {
                 if (lines[j].trim().startsWith('@')) {
                    hasDecorator = true;
                    break;
                 }
                 if (lines[j].trim() === '' || lines[j].trim().startsWith('//')) {
                    continue;
                 }
                 break; // Hit something else
               }
               if (!hasDecorator) {
                 console.log(`${fullPath}:${i + 1}: Missing decorator for ${line.trim()}`);
               }
            }
          }
        }
      }
    }
  }
}

findMissingDecorators('./src');
