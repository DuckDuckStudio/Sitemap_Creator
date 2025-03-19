import { writeFileSync, readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import https from 'https';

// 必要参数
const now = new Date();
const location = process.env.LOCATION;
const basicLink = process.env.BASIC_LINK;
const fileType = process.env.FILE_TYPE;
const fileTypes = fileType.split(',').map(type => type.trim());
const ignoreFile = process.env.IGNORE_FILE;
const ignorePatterns = ignoreFile.split(',').map(item => item.trim());
const websitePath = process.env.WEBSITE_PATH;
const debug = process.env.DEBUG;
const urls = new Set();

// 去除基础链接末尾的斜杠 - #16
if (basicLink.endsWith('/')) {
    basicLink = basicLink.slice(0, -1);
}

// 通过 Git 命令，获取文件的最后提交日期
function getLastCommitDate(filePath) {
    try {
        // 使用 git log 命令获取最后一次提交的时间
        const result = execFileSync('git', ['log', '-1', '--format=%cI', '--', filePath], { cwd: websitePath });
        return result.toString().trim();
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
                        console.log(`[DEBUG] 跳过文件 [${fullPath}] 因为其路径中包含 [${pattern}]`);
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

try {
    console.log(`[DEBUG] Debug状态: ${debug}`)
    if (debug) {
        console.log(`[DEBUG] 网站地图存放路径: ${location}`)
        console.log(`[DEBUG] 网站基础链接: ${basicLink}`)
        console.log(`[DEBUG] 网站文件存放路径: ${websitePath}`)
        console.log(`[DEBUG] 页面文件类型: ${fileTypes}`)
        console.log(`[DEBUG] 忽略的文件: ${ignorePatterns}`)
    }
    // -----------------

    scanDirectory(websitePath);

    // 获取当前日期并格式化
    const currentDate = now.toLocaleString();

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

    // 避免重复
    try {
        let oldSitemap = readFileSync(location, 'utf8');
        if (sitemap.split('\n').splice(2).join('\n') === oldSitemap.split('\n').splice(2).join('\n')) {
            console.log('[WARNING] 网站地图没有任何修改，跳过后续处理。');
            process.exit(0);
        }
    } catch (error) {
        console.error(`[ERROR] 读取旧 sitemap.xml 文件失败: ${error.message}`);
    }

    // 保存 sitemap.xml 文件
    writeFileSync(location, sitemap, 'utf8');

    console.log(`[INFO] 已成功生成并保存为 ${location}`);
} catch (error) {
    console.error('[ERROR] 生成 Sitemap 时发生错误:', error.message);
    process.exit(1);
}

// 自动关闭过时的更新请求
async function closeOutdatedPRs() {
    const options = {
        hostname: 'api.github.com',
        path: `/repos/${process.env.GITHUB_REPOSITORY}/pulls?state=open&per_page=100`,
        headers: {
            'Authorization': `token ${process.env.TOKEN}`,
            'User-Agent': 'node.js'
        }
    };

    const fetchPRs = (page = 1) => {
        return new Promise((resolve, reject) => {
            https.get({ ...options, path: `${options.path}&page=${page}` }, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    const pulls = JSON.parse(data);
                    resolve(pulls);
                });
            }).on('error', (e) => {
                reject(`[ERROR] 请求失败: ${e.message}`);
            });
        });
    };

    let page = 1;
    let pulls = [];
    let fetchedPRs;

    do {
        fetchedPRs = await fetchPRs(page);
        pulls = pulls.concat(fetchedPRs);
        page++;
    } while (fetchedPRs.length === 100);

    const outdatedPRs = pulls.filter(pr => pr.title.includes('自动更新网站地图') && pr.base.ref === process.env.BASE_BRANCH && pr.head.ref.includes('Sitemap_Creator'));

    outdatedPRs.forEach(pr => {
        execFileSync('gh', ['pr', 'comment', pr.number, '--body', "[[Sitemap Creator](https://github.com/DuckDuckStudio/Sitemap_Creator)] 此拉取请求似乎已过时，将自动关闭。"]);
        execFileSync('gh', ['pr', 'close', pr.number, '--delete-branch']);
        console.log(`[INFO] 已关闭过时的拉取请求: ${pr.html_url}`);
    });
}

try {
    // 获取当前日期和时间
    const DATE_TIME = now.toLocaleString();

    // 提交者名和邮箱
    const AUTHOR_NAME = process.env.AUTHOR_NAME.replace(/[\"\'\`]/g, '');
    const AUTHOR_EMAIL = process.env.AUTHOR_EMAIL.replace(/[\"\'\`]/g, '');

    // 参数处理
    let UPDATE_WAY = process.env.UPDATE.toLowerCase().replace(/[\"\'\`-]/g, '').replace(/\s/g, '');
    let CLEAN_AUTO_MERGE = '';
    let CLEAN_LABELS = '';
    let CLEAN_REVIEWER = '';
    let BRANCH_NAME = '';

    if (['pr', 'pullrequest', 'pullrequests', 'prs', '拉取请求'].includes(UPDATE_WAY)) {
        UPDATE_WAY = 'PR';
        if (debug) {
            console.log('[DEBUG] 更新方式: 创建拉取请求');
        }

        if (!process.env.AUTO_MERGE) {
            if (debug) {
                console.log('[DEBUG] 不启用自动合并，因为自动合并方式为空');
            }
        } else {
            CLEAN_AUTO_MERGE = process.env.AUTO_MERGE.toLowerCase().replace(/[\"\'\`-]/g, '');
            if (['s', 'squash', '压缩', '压缩合并', '压缩自动合并'].includes(CLEAN_AUTO_MERGE)) {
                CLEAN_AUTO_MERGE = 'squash';
            } else if (['m', 'merge', '合并', '合并提交', '提交'].includes(CLEAN_AUTO_MERGE)) {
                CLEAN_AUTO_MERGE = 'merge';
            } else if (['r', 'rebase', '变基', '变基合并', '变基自动合并'].includes(CLEAN_AUTO_MERGE)) {
                CLEAN_AUTO_MERGE = 'rebase';
            } else {
                console.error(`[ERROR] 未知的自动合并方式: ${process.env.AUTO_MERGE}`);
                console.error('[TIP] 可用的自动合并方式: 压缩、合并、变基');
                process.exit(1);
            }
        }

        if (process.env.AUTO_MERGE !== CLEAN_AUTO_MERGE && debug) {
            console.log(`[DEBUG] 已格式化自动合并方式: ${process.env.AUTO_MERGE} -> ${CLEAN_AUTO_MERGE}`);
        }

        CLEAN_LABELS = process.env.LABELS.replace(/[\"\'\`]/g, '');
        if (process.env.LABELS !== CLEAN_LABELS && debug) {
            console.log(`[DEBUG] 标签包含特殊字符，已移除: ${process.env.LABELS} -> ${CLEAN_LABELS}`);
        }

        CLEAN_REVIEWER = process.env.REVIEWER.replace(/[\"\'\`]/g, '');
        if (process.env.REVIEWER !== CLEAN_REVIEWER && debug) {
            console.log(`[DEBUG] 审查者信息包含特殊字符，已移除: ${process.env.REVIEWER} -> ${CLEAN_REVIEWER}`);
        }

        if (CLEAN_REVIEWER) {
            const reviewers = CLEAN_REVIEWER.split(',');
            const options = {
                hostname: 'api.github.com',
                path: `/repos/${process.env.GITHUB_REPOSITORY}/collaborators`,
                headers: {
                    'Authorization': `token ${process.env.TOKEN}`,
                    'User-Agent': 'node.js'
                }
            };

            const validateReviewers = () => {
                return new Promise((resolve, reject) => {
                    https.get(options, (res) => {
                        let data = '';
                        res.on('data', (chunk) => {
                            data += chunk;
                        });

                        res.on('end', () => {
                            const statusCode = res.statusCode.toString();
                            const collaborators = JSON.parse(data);

                            if (['200', '201'].includes(statusCode)) {
                                reviewers.forEach(reviewer => {
                                    const isCollaborator = collaborators.some(collaborator => collaborator.login === reviewer);
                                    if (!isCollaborator) {
                                        reject(`[ERROR] ${reviewer} 不是仓库的协作者`);
                                    } else if (debug) {
                                        console.log(`[DEBUG] 审查者 ${reviewer} 鉴权成功`);
                                    }
                                });
                                resolve();
                            } else if (statusCode === 401) {
                                reject('[ERROR] 验证审查者时出错: 鉴权失败 (401):');
                            } else if (statusCode === 403) {
                                reject('[ERROR] 验证审查者时出错: 没有权限或达到速率限制 (403)');
                            } else if (statusCode === 404) {
                                reject('[ERROR] 验证审查者时出错: 没有权限或仓库不存在 (404)');
                            } else {
                                reject(`[ERROR] 验证审查者时出错: 未命中的非成功状态码 (${statusCode})`);
                            }
                        });
                    }).on('error', (e) => {
                        reject(`[ERROR] 请求失败: ${e.message}`);
                    });
                });
            };

            try {
                await validateReviewers();
            } catch (error) {
                console.error(error);
                process.exit(1);
            }
        }

        BRANCH_NAME = `Sitemap_Creator-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
        execFileSync('git', ['checkout', '-b', BRANCH_NAME]);
        console.log(`[INFO] 已创建新分支: ${BRANCH_NAME}`);
    } else if (['commit', '提交', '直接提交', 'directcommit', 'commitdirectly'].includes(UPDATE_WAY)) {
        UPDATE_WAY = 'Commit';
        if (debug) {
            console.log('[DEBUG] 更新方式: 直接提交到主分支');
        }

        const params = ['LABELS', 'AUTO_MERGE'];
        params.forEach(paramName => {
            const paramValue = process.env[paramName];
            if (paramValue) {
                console.error('[ERROR] 错误的参数传递');
                console.error(`[TIP] ${paramName} 参数不得与更新方式“提交”共存`);
                process.exit(1);
            }
        });
        BRANCH_NAME = process.env.BASE_BRANCH; // 直接提交直接推到基分支
    } else {
        console.error(`[ERROR] 未知的更新方式: ${process.env.AUTO_MERGE}`);
        console.error('[TIP] 可用的更新方式: 提交、拉取请求');
        process.exit(1);
    }

    // 配置 Git 用户
    execFileSync('git', ['config', 'user.name', AUTHOR_NAME]);
    execFileSync('git', ['config', 'user.email', AUTHOR_EMAIL]);

    // 提交并推送 sitemap.xml
    execFileSync('git', ['add', process.env.LOCATION]);
    execFileSync('git', ['commit', '-m', `[${DATE_TIME}] 自动更新网站地图`]);
    execFileSync('git', ['push', '--set-upstream', 'origin', BRANCH_NAME]);

    if (UPDATE_WAY === 'PR') {
        // 关闭过时的更新请求
        await closeOutdatedPRs();

        const WORKFLOW_URL = `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
        const PR_URL = execFileSync('gh', ['pr', 'create', '--title', `[${DATE_TIME}] 自动更新网站地图`, '--body', `此拉取请求通过 [工作流](${WORKFLOW_URL}) 使用 [Sitemap Creator](https://github.com/DuckDuckStudio/Sitemap_Creator) 创建。`, '--base', process.env.BASE_BRANCH, '--head', BRANCH_NAME]).toString().trim();
        console.log(`[INFO] 已创建拉取请求: ${PR_URL}`);

        if (CLEAN_LABELS) {
            execFileSync('gh', ['pr', 'edit', PR_URL, '--add-label', CLEAN_LABELS]);
            console.log(`[INFO] 已为创建的拉取请求添加标签: ${CLEAN_LABELS}`);
        } else if (debug) {
            console.log('[DEBUG] 没有有效标签，跳过添加标签');
        }

        if (CLEAN_REVIEWER) {
            execFileSync('gh', ['pr', 'edit', PR_URL, '--add-reviewer', CLEAN_REVIEWER]);
            console.log(`[INFO] 已为创建的拉取请求添加审查者: ${CLEAN_REVIEWER}`);
        } else if (debug) {
            console.log('[DEBUG] 没有有效审查者，跳过添加审查者');
        }

        if (CLEAN_AUTO_MERGE) {
            execFileSync('gh', ['pr', 'merge', PR_URL, `--${CLEAN_AUTO_MERGE}`, '--auto']);
            console.log(`[INFO] 已为拉取请求启用 ${CLEAN_AUTO_MERGE} 合并`);
        } else if (debug) {
            console.log('[DEBUG] 没有有效自动合并方式，跳过启用自动合并');
        }
    }
    process.exit(0);
} catch (error) {
    console.error('[ERROR] 推送 Sitemap 时发生错误:', error.message);
    process.exit(1);
}
