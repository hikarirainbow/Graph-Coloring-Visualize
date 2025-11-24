# Graph Coloring Visualizer

This project is a web-based visualizer for various Graph Coloring algorithms, including Greedy, Exact, and Meta-heuristic approaches. It also features a Benchmark mode to compare algorithm performance.

## Prerequisites

- **Node.js**: You need to have Node.js installed to run this project.
  - Download: [https://nodejs.org/](https://nodejs.org/)
  - Verify installation: Run `node -v` and `npm -v` in your terminal.

## Installation

Since the project files were manually created, you just need to install the dependencies:

1.  Open a terminal in this directory.
2.  Run the following command:
    ```bash
    npm install
    ```

## Running the Application

To start the development server:

1.  Run:
    ```bash
    npm run dev
    ```
2.  Open your browser and navigate to the URL shown in the terminal (usually `http://localhost:5173`).

## Project Structure

- `src/components`: UI components (GraphCanvas, Controls, Charts).
- `src/core`: Core logic (Graph data structure).
- `src/algorithms`: Algorithm implementations (Greedy, Exact, Meta-heuristics).
- `src/workers`: Web Workers for running algorithms without freezing the UI.
- `src/hooks`: Custom React hooks.

## Features

- **Visualizer Mode**: Watch algorithms color the graph step-by-step.
- **Benchmark Mode**: Compare algorithms on graphs of increasing size.
- **Algorithms**:
    - **Greedy**: Basic, Welsh-Powell, DSatur, RLF.
    - **Exact**: Backtracking, Branch & Bound, ILP.
    - **Meta-heuristics**: Genetic Algorithm, Simulated Annealing, Tabu Search.
