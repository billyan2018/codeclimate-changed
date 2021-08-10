import * as github from '@actions/github';
import * as core from '@actions/core';
const fs = require('fs');
const INPUT_FILE = 'raw_codeclimate.json';
const OUTPUT_FILE = 'changed_codeclimate.json';

interface FileLines {
  start: number;
  end: number;
}

export interface ModifiedFile {
  name: string;
  deletion?: FileLines[];
  addition?: FileLines[];
}





async function run() {
  core.info('run changed lines');
  const { context } = github;
  core.info(`${context}`);
  const request = context.payload.pull_request;
  if (request == null) {
    core.setFailed('No pull request found.');
    return null;
  }

  const base = request.base.sha;
  const head = request.head.sha;

  const client = github.getOctokit(core.getInput('token', {required: true}));

  const response = await client.repos.compareCommits({
    base,
    head,
    owner: context.repo.owner,
    repo: context.repo.repo,
  });

  const files = response.data.files;
  core.info(`${files}`);
  const modifiedFilesWithModifiedLines = files?.map(parseFile);
  if (modifiedFilesWithModifiedLines != null) {
    modifiedFilesWithModifiedLines.forEach(line=>core.info(line.name));
    const changedFiles = modifiedFilesWithModifiedLines.map(item=> item.name);
    const rawdata = fs.readFileSync(INPUT_FILE);
    core.info(`rawdata: ${rawdata}`);
    const issues = JSON.parse(rawdata).filter((item: any) => changedFiles.includes(item.location.path));
    const data = JSON.stringify(issues);
    fs.writeFileSync(OUTPUT_FILE, data);
    core.info(`issues in changed files:${data}`);
  }
  

  return modifiedFilesWithModifiedLines;
}

function parseFile(file: {filename: string, patch?: string|undefined}): ModifiedFile {
  const modifiedFile: ModifiedFile = {
    name: file.filename
  };
  if (file.patch) {
    // The changes are included in the file
    const patches = file.patch.split('@@').filter((_, index) => index % 2); // Only take the line information and discard the modified code
    for (const patch of patches) {
      // patch is usually like " -6,7 +6,8"
      try {
        const hasAddition = patch.includes('+');
        const hasDeletion = patch.includes('-');
        if (hasAddition) {
          const lines = patch.match(/\+.*/)![0].trim().slice(1).split(',').map(num => parseInt(num)) as [number, number];
          modifiedFile.addition ??= [];
          modifiedFile.addition?.push({
            start: lines[0],
            end: lines[0] + lines[1],
          });
        }
        if (hasDeletion) {

          const lines = patch.split('+')[0].trim().slice(1).split(',').map((num) => parseInt(num)) as [number, number];
          modifiedFile.deletion ??= [];
          modifiedFile.deletion?.push({
            start: lines[0],
            end: lines[0] + lines[1],
          });
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
core.info('run');
run ();
