# GitView

GitView is a [Electron](https://electronjs.org) based tool that represents graphically data from Git repositories using [D3.js](https://d3js.org).

This tool uses information visualization techniques to represent the changes made in a specific commit.

## Graph based visualization

In this visualization a graph based visualization is used to show the project tree with the changes made to the files in the selected commit. Each directory or file is represented by a clickable node. By clicking a directory, it is expanded or collapsed and by clicking a file, your information is shown in the right side panel.

![preview-graph](https://github.com/nhtoshiaki/GitView/blob/master/preview-graph.png)

## Treemap

In the treemap, each directory and file are represented by clickable rectangle. By clicking it, if it is a directory it is expanded or if it is a file, as in the graph based visualization, its information is shown in the right side panel. Also by clicking on the legend (that shows the current directory path) the parent directory is shown.

![preview-treemap](https://github.com/nhtoshiaki/GitView/blob/master/preview-treemap.png)

[See the wiki for more details](https://github.com/nhtoshiaki/GitView/wiki).

## Usage

You can download the lastest release as ZIP file from [here](https://github.com/nhtoshiaki/GitView/releases/latest).

Or cloning this repository to have the latest version in development. To clone this repository and run the tool you'll need [Git](https://git-scm.com) and [Node.js](https://nodejs.org/en/download) (with [npm](npmjs.com)) installed on your computer. From your command line:

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
