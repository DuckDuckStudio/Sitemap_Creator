import { writeFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { execSync } from 'child_process';

try {
  // 必要参数
  const location = process.env.LOCATION;
  const basicLink = process.env.BASIC_LINK;
  const fileType = process.env.FILE_TYPE;
  const fileTypes = fileType.split(',').map(type => type.trim());
  const ignoreFile = process.env.IGNORE_FILE;
  const ignorePatterns = ignoreFile.split(',').map(item => item.trim());
  const websitePath = process.env.WEBSITE_PATH;
  const debug = process.env.DEBUG;

  const urls = new Set();

  console.log(`[DEBUG] Debug状态: ${debug}`)
  if (debug) {
    console.warn(`[DEBUG] 网站地图存放路径: ${location}`)
    console.warn(`[DEBUG] 网站基础链接: ${basicLink}`)
    console.warn(`[DEBUG] 网站文件存放路径: ${websitePath}`)
    console.warn(`[DEBUG] 页面文件类型: ${fileTypes}`)
    console.warn(`[DEBUG] 忽略的文件: ${ignorePatterns}`)
  }
  // -----------------

  // 通过 Git 命令，获取文件的最后提交日期
  function getLastCommitDate(filePath) {
    try {
      // 使用 git log 命令获取最后一次提交的时间
      const result = execSync(`git log -1 --format=%cI -- "${filePath}"`, { cwd: websitePath });
      const lastCommitDate = result.toString().trim();
      return lastCommitDate
    } catch (err) {
      console.error(`[ERROR] 获取 ${filePath} 的最后提交时间失败: `, err);
      return ''; // 出错时返回空字符串
    }
  }

  // 扫描目录并生成 URL 列表
  function scanDirectory(dir) {
    const files = readdirSync(dir);
    files.forEach(file => {
      const fullPath = path.join(dir, file);
      const stat = statSync(fullPath);

      // 如果是目录，递归扫描
      if (stat.isDirectory()) {
        scanDirectory(fullPath);
      } else if (fileTypes.includes(path.extname(file).slice(1))) {
        const relativePath = path.relative(websitePath, fullPath).replace(/\\/g, '/');

        // 如果当前路径在忽略列表中，则跳过
        if (ignorePatterns.some(pattern => {
          if (relativePath.includes(pattern)) {
            if (debug) {
              console.warn(`[DEBUG] 跳过文件 [${fullPath}] 因为其路径中包含 [${pattern}]`);
            }
            return true; // 如果找到了匹配的模式，返回 true，表示该文件应被忽略
          }
          return false; // 如果没有找到匹配的模式，返回 false，继续检查下一个模式
        })) {
          return; // 如果前面 true 跳过此文件
        }

        const lastmod = getLastCommitDate(relativePath); // 获取文件最后提交时间
        const encodedPath = encodeURIComponent(relativePath).replace(/%2F/g, '/'); // 对路径进行编码并替换%2F为/

        // 删除 URL 中的 `.md` 后缀
        const urlWithoutMd = encodedPath.replace(/\.md$/, '');

        const fullUrl = `${basicLink}/${urlWithoutMd}`;

        // 只在获取到有效的 lastmod 时添加 <lastmod> 标签
        const urlTag = `  <url>\n    <loc>${fullUrl}</loc>`;
        if (lastmod) {
          // 如果 lastmod 存在，添加 <lastmod>
          urls.add(`${urlTag}\n    <lastmod>${lastmod}</lastmod>\n  </url>`);
        } else {
          // 如果没有 lastmod，直接添加 <loc>
          urls.add(`${urlTag}\n  </url>`);
        }
      }
    });
  }

  scanDirectory(websitePath);

  // 获取当前日期并格式化
  const currentDate = new Date().toISOString();

  // 创建 sitemap.xml 文件内容
  let sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  sitemap += `<!-- 生成日期: ${currentDate} -->\n`; // 添加生成日期的注释
  sitemap += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" 
              xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
              xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 
                                  http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">\n\n`;

  // 生成 URL 列表
  urls.forEach(url => {
    sitemap += url; // 每个 URL 包含 <loc> 和可能的 <lastmod>
    sitemap += `\n`; // 添加换行
  });

  sitemap += `</urlset>\n`;

  // 保存 sitemap.xml 文件
  writeFileSync(location, sitemap, 'utf8');

  console.log(`[INFO] 已成功生成并保存为 ${location}`);
} catch (error) {
  throw new Error(`[ERROR] 生成 Sitemap 时发生错误: ${error.message}`);
}
