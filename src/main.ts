import * as github from '@actions/github';
import * as core from '@actions/core';
import * as fs from 'fs';
import addComments from './pr-comment';

const INPUT_FILE = 'raw_codeclimate.json';

interface FileLines {
  start: number;
  end: number;
}

export interface ModifiedFile {
  name: string;
  deletion?: FileLines[];
  addition?: FileLines[];
}
const token = core.getInput('token', { required: true });
async function retrieveChangedFiles(): Promise<{ filename: string, patch?: string | undefined }[] | undefined> {
  const { context } = github;
  const request = context.payload.pull_request;
  if (request == null) {
    core.setFailed('No pull request found.');
    process.exit(core.ExitCode.Failure);
  }

  const client = github.getOctokit(token);
  const response = await client.repos.compareCommits({
    base: request.base.sha,
    head: request.head.sha,
    owner: context.repo.owner,
    repo: context.repo.repo,
  });
  return response.data.files;
}

async function run(): Promise<void> {

  const files = await retrieveChangedFiles();
  if (!files || files.length == 0) {
    core.info('No changes found.');
    return;
  }
  const modifiedFilesWithModifiedLines = files.map(parseFile);
  if (modifiedFilesWithModifiedLines != null) {
    modifiedFilesWithModifiedLines.forEach(line => core.info(line.name));
    core.info(`changes: ${JSON.stringify(modifiedFilesWithModifiedLines)}`);

    const changedFiles = modifiedFilesWithModifiedLines.map(item => item.name);
    const rawdata = fs.readFileSync(INPUT_FILE);

    let issuesInChangedFiles = JSON.parse(rawdata.toString())
      .filter((item: any) => changedFiles.includes(item.location.path));
    issuesInChangedFiles = issuesInChangedFiles.filter((issue: any) => {
      const { path, lines } = issue.location;
      const files = modifiedFilesWithModifiedLines.filter(file => file.name === path);
      if (files && files.length > 0) {
        const file = files[0];
        return file.addition?.some(block => block.start <= lines.begin && block.end >= lines.end);
      }
      return false;
    });
    const data = JSON.stringify(issuesInChangedFiles);

    core.info(`issues in changed files:${data}`);
    if (issuesInChangedFiles && issuesInChangedFiles.length > 0) {
      let message = 'This PR has the following issues:\n';
      issuesInChangedFiles.forEach((issue: any) => {
        message += `- [${issue.engine_name}-${issue.check_name}]: ${issue.location.path}: line: ${issue.location.lines.begin}: ${issue.description} \n`;
      });
      const commentResult = await addComments(message, token);
      core.info(`commentResult ${commentResult}`);
      core.error(data);
      core.setFailed('The PR introduces new issues above');
      process.exit(core.ExitCode.Failure);
    }
  }
}

function parseFile(file: { filename: string, patch?: string | undefined }): ModifiedFile {
  const modifiedFile: ModifiedFile = {
    name: file.filename
  };
  core.info(`file:${file.filename}: path: ${file.patch}`);
  if (file.patch) {
    // The changes are included in the file
    const patches = file.patch.split('@@').filter((_, index) => index % 2); // Only take the line information and discard the modified code
    for (const patch of patches) {
      // patch is usually like " -6,7 +6,8"
      try {
        const hasAddition = patch.includes('+');
        const pathMatch = patch.match(/\+.*/);
        if (hasAddition && pathMatch != null && pathMatch.length > 0) {
          const lineNumbers = pathMatch[0].trim().slice(1).split(',').map(num => parseInt(num)) as [number, number];
          const offset = lineNumbers[0];
          console.log(offset);
          const lines = patch.split('\n');
          console.log(lines);
          let removed = 0;
          let addedStart = 0;
          let addedEnd = 0;
          for (let i = 1; i < lines.length; i++) {
            if (lines[i].startsWith('+')) {
              if (addedStart == 0) {
                addedStart = offset + i - removed - 1;
                addedEnd = offset + i - removed - 1;
              } else {
                addedEnd = offset + i - removed - 1;
              }
            } else {
              if (lines[i].startsWith('-')) {
                removed++;
              }
              if (addedStart > 0) {
                recordChangedLines(modifiedFile, addedStart, addedEnd);
              }
              addedStart = 0;
              addedEnd = 0;
            }
          }
          if (addedStart > 0) {
            recordChangedLines(modifiedFile, addedStart, addedEnd);
          }
        }
      } catch (error) {
        core.error(`Error getting the patch of the file:\n${error}`);
      }
    }
  } else {
    // Take the all file
    modifiedFile.addition = [{
      start: 0,
      end: Infinity,
    }];
    modifiedFile.deletion = [{
      start: 0,
      end: Infinity,
    }];
  }
  return modifiedFile;
};
function recordChangedLines(file: ModifiedFile, start: number, end: number): void {
  file.addition ??= [];
  file.addition?.push({
    start,
    end,
  });
}
core.info('run');
run();
