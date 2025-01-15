const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.REPO || "未成功获取";
const GITHUB_RUN_ID = process.env.GITHUB_RUN_ID || "未成功获取";
const WORKFLOW_URL = `https://github.com/${REPO}/actions/runs/${GITHUB_RUN_ID}`;

const AUTO_BUG_REPORT = process.env.AUTO_BUG_REPORT || "未成功获取";
const FAILURE_STEP = process.env.FAILURE_STEP || "未成功获取";
const DEBUG = process.env.DEBUG || "未成功获取";

// 清理自动错误报告开关
const CLEAN_AUTO_BUG_REPORT = AUTO_BUG_REPORT.toLowerCase().replace(/["'`-]/g, "");

console.log("[INFO] 此工作流似乎在某些地方出现了错误，正在检查是否启用了自动错误报告...");

if (DEBUG) {
  console.log(`[DEBUG] 清理后传入的自动错误报告开关: ${CLEAN_AUTO_BUG_REPORT}`);
}

if (CLEAN_AUTO_BUG_REPORT === "true" || CLEAN_AUTO_BUG_REPORT === "启用" || CLEAN_AUTO_BUG_REPORT === "开启" || CLEAN_AUTO_BUG_REPORT === "open") {
  console.log("[INFO] 自动错误报告已启用");

  if (!GITHUB_TOKEN){
    throw new Error("[ERROR] 未能获取到 GitHub Action Token");
  }

  if (DEBUG) {
    console.log(`[DEBUG] 获取到的出错步骤: ${FAILURE_STEP}`);
  }

  if (FAILURE_STEP.includes("权限")) {
    console.warn("[WARNING] 我们无法帮您解决权限相关错误，请参阅我们的文档以了解可能需要赋予的权限:")
    console.warn("[WARNING] https://github.com/DuckDuckStudio/Sitemap_Creator/blob/main/README.md#1-%E5%A6%82%E4%BD%95%E5%85%81%E8%AE%B8-github-action-%E5%88%9B%E5%BB%BA%E6%8B%89%E5%8F%96%E8%AF%B7%E6%B1%82--%E6%8E%A8%E9%80%81%E4%BF%AE%E6%94%B9")
    throw new Error("[ERROR] 不是我们的错误，不能提交错误报告");
  } else if (FAILURE_STEP.includes("参数")) {
    console.warn("[WARNING] 我们无法帮您解决参数冲突相关错误，请参阅调试输出(使用\`debug: true\`启用)来确定您输入的参数是否正确传递，如果出现意外的参数传递，请手动提交 Issue")
    console.warn("[WARNING] 在参数检查阶段，如果出现参数冲突，会输出具体的冲突原因，请尝试按照输出解决")
    throw new Error("[ERROR] 不是我们的错误，不能提交错误报告");
  } else {
    console.warn ("未匹配到任何已知错误分类，提交错误报告");
  }

  let issueBody = `> 这是一个由 [Sitemap Creator](https://github.com/DuckDuckStudio/Sitemap_Creator) 自动创建的错误报告。\n### 问题类别\n\n### 错误工作流链接\n\n${WORKFLOW_URL}\n\n### 使用的参数\n\n\`\`\`yml\ndebug: ${DEBUG}\nauto_bug_report: ${AUTO_BUG_REPORT}\nlocation: ${process.env.LOCATION}\nbasic_link: ${process.env.BASIC_LINK}\nfile_type: ${process.env.FILE_TYPE}\nignore_file: ${process.env.IGNORE_FILE}\nwebsite_path: ${process.env.WEBSITE_PATH}\nlabels: ${process.env.LABELS}\nauto_merge: ${process.env.AUTO_MERGE}\nupdate: ${process.env.UPDATE}\n\`\`\`\n\n`;

  // 构建 GitHub API 请求
  const apiUrl = `https://api.github.com/repos/DuckDuckStudio/Sitemap_Creator/issues`;

  const issueData = {
    title: `[错误报告] ${FAILURE_STEP}`,
    body: issueBody
  };

  // 发送 POST 请求创建 Issue
  fetch(apiUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GITHUB_TOKEN}`,
      "Accept": "application/vnd.github.v3+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(issueData)
  })
  .then(response => response.json())
  .then(data => {
    console.log("[INFO] 已提交错误报告", data);
  })
  .catch(error => {
    throw new Error(`[ERROR] 提交错误报告失败: ${error}`);
  });
} else {
  console.log("[INFO] 自动错误报告已禁用");
}
