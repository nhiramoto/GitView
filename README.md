# GitView

GitView is a [Electron](https://electronjs.org) based tool that represents graphically data from Git repositories using [D3.js](https://d3js.org).

This tool uses information visualization techniques to represent the changes made in a specific commit.

## Graph based visualization

In this visualization a graph based visualization is used to show the project tree with the changes made to the files in the selected commit.

![preview-graph](https://github.com/nhtoshiaki/GitView/blob/master/preview-graph.png)

## Treemap

In the treemap, each directory is represented by a clickable rectangle. By clicking the rectangle, the files contained in the directory are revealed. Also by clicking on the legend (that shows the current directory path) the parent directory is shown.

![preview-treemap](https://github.com/nhtoshiaki/GitView/blob/master/preview-treemap.png)

## Usage

To use this tool you'll need [Git](https://git-scm.com) and [Node.js](https://nodejs.org/en/download) (with [npm](npmjs.com)) installed on your computer. From your command line:

```bash
# Clone this repository
git clone https://github.com/nhtoshiaki/GitView.git

# Go into the repository folder
cd GitView.git

# Installs the dependencies
npm install

# Run the tool
npm start
```
