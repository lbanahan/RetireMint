# RetireMint

RetireMint is a comprehensive financial planning and retirement simulation platform that helps users model complex financial scenarios using Monte Carlo simulations. The application allows users to create detailed financial plans by inputting their investments, income streams, expenses, and life events, then runs thousands of multithreaded simulations to predict the probability of achieving their financial goals. Users can model various scenarios including career changes, major purchases, investment strategies, and retirement planning, with the system accounting for factors like inflation, taxes (both federal and state), market volatility, and life expectancy variations.

The platform features an intuitive React-based frontend where users can build scenarios through drag-and-drop interfaces, visualize results through interactive charts and graphs, and share scenarios with others. The backend uses Node.js and MongoDB to store user data and run sophisticated financial calculations, including tax optimization, Roth conversions, required minimum distributions, and investment rebalancing strategies. RetireMint essentially democratizes access to advanced financial planning tools, making retirement planning accessible to everyday users through an easy-to-use web interface.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Technologies Used](#technologies-used)
- [Project Structure](#project-structure)
- [Setup Instructions](#setup-instructions)
- [How It Works](#how-it-works)
- [Key Features](#key-features)
- [API Endpoints](#api-endpoints)

## Architecture Overview

RetireMint follows a **MERN stack** architecture (MongoDB, Express, React, Node.js) with a clear separation between frontend and backend:

### Frontend (`retiremint/client/`)
- **React 19 + Vite** application running on port 3000
- Component-based architecture with reusable UI components
- Uses React Router for navigation
- Integrates with multiple charting libraries (Recharts, Plotly.js, Chart.js) for data visualization
- Communicates with backend via Axios HTTP requests

### Backend (`retiremint/server/`)
- **Express.js** REST API server running on port 8000
- **MongoDB** database for persistent data storage
- Worker threads for parallel Monte Carlo simulation execution
- Modular architecture with separate routes, schemas, and simulation engine

### Data Flow
1. User creates/edits scenarios in React frontend
2. Frontend sends scenario data to Express backend via REST API
3. Backend stores scenario in MongoDB with nested document structure
4. When simulation is requested, backend fetches scenario data
5. Simulation engine spawns multiple worker threads for parallel execution
6. Each worker runs independent Monte Carlo simulation
7. Results are aggregated and analyzed
8. Statistics and visualizations are generated
9. Results stored as Report documents in MongoDB
10. Frontend displays interactive charts and graphs

## Technologies Used

### Backend
- **MongoDB** - NoSQL database for storing scenarios, users, reports, and tax data
- **Express.js** - Web framework for REST API
- **Node.js** - JavaScript runtime environment
- **Mongoose** - MongoDB object modeling for Node.js
- **Worker Threads** - For parallel Monte Carlo simulation execution
- **Google OAuth** - User authentication via Google accounts
- **Multer** - File upload handling for state tax YAML files
- **Cheerio** - Web scraping for tax data and RMD tables
- **js-yaml** - YAML parsing for scenario import/export

### Frontend
- **React 19** - UI library
- **React Router** - Client-side routing
- **Axios** - HTTP client for API requests
- **Recharts** - Charting library for financial visualizations
- **Plotly.js** - Advanced 3D and interactive visualizations
- **Chart.js** - Additional charting capabilities
- **@hello-pangea/dnd** - Drag-and-drop functionality

### Testing & Development
- **Jest** - Testing framework
- **ESLint** - Code linting
- **Supertest** - API endpoint testing

## Project Structure

```
RetireMint/
├── retiremint/
│   ├── client/                 # React frontend application
│   │   ├── public/            # Static assets
│   │   ├── src/
│   │   │   ├── components/   # React components
│   │   │   │   ├── DashboardComp.js
│   │   │   │   ├── NewScenario.js
│   │   │   │   ├── SimulationResults.js
│   │   │   │   ├── InvestmentForm.js
│   │   │   │   ├── EventForm.js
│   │   │   │   └── ...
│   │   │   ├── Stylesheets/  # CSS files
│   │   │   ├── App.js        # Main app component
│   │   │   └── index.js      # Entry point
│   │   └── package.json
│   │
│   └── server/                # Node.js/Express backend
│       ├── server.js          # Main server file
│       ├── src/
│       │   ├── Routes/        # API route handlers
│       │   │   ├── User.js
│       │   │   ├── Simulation.js
│       │   │   ├── Import.js
│       │   │   └── Export.js
│       │   ├── Schemas/       # Mongoose data models
│       │   │   ├── Scenario.js
│       │   │   ├── Users.js
│       │   │   ├── Investments.js
│       │   │   ├── Report.js
│       │   │   └── ...
│       │   ├── SimulationEngine/  # Core simulation logic
│       │   │   ├── SimulateYear.js
│       │   │   └── modules/       # Year-by-year calculation modules
│       │   │       ├── IncomeEvents.js
│       │   │       ├── ExpenseEvents.js
│       │   │       ├── InvestmentReturns.js
│       │   │       ├── RothConversion.js
│       │   │       ├── RequiredMinimumDistributions.js
│       │   │       └── ...
│       │   ├── FederalTaxes/  # Tax calculation modules
│       │   │   ├── incomeTax.js
│       │   │   ├── capitalGain.js
│       │   │   └── standardDeduction.js
│       │   ├── StateTaxes/    # State tax YAML files
│       │   ├── ImportScenario/ # YAML import functionality
│       │   ├── ExportScenario/ # YAML export functionality
│       │   ├── Utils/         # Utility functions
│       │   │   ├── loadStateTaxes.js
│       │   │   └── scrapeRMDTable.js
│       │   ├── RunOneSimulation.js  # Single simulation runner
│       │   ├── SimulationEngine.js  # Multi-simulation coordinator
│       │   └── simulationWorker.js # Worker thread script
│       └── package.json
│
└── SimulationDemo/            # Standalone simulation demos
```

## Setup Instructions

### Prerequisites
- **Node.js** (v14 or higher)
- **MongoDB** (v4.4 or higher)
- **npm** or **yarn** package manager

### Installation Steps

1. **Clone the repository** (if applicable)
   ```bash
   git clone <repository-url>
   cd RetireMint
   ```

2. **Install frontend dependencies**
   ```bash
   cd retiremint/client
   npm install
   ```

3. **Install backend dependencies**
   ```bash
   cd ../server
   npm install
   ```

4. **Start MongoDB**
   ```bash
   mongod
   ```
   This starts the MongoDB server on the default port (27017). The database name is `retiremint`.

5. **Start the backend server**
   ```bash
   cd retiremint/server
   npm start
   ```
   If you need to allow self-signed certificates locally:
   ```bash
   cd retiremint/server
   npm run start:local-insecure
   ```
   The server will:
   - Connect to MongoDB at `mongodb://localhost:27017/retiremint`
   - Load state tax data
   - Scrape and save RMD (Required Minimum Distribution) tables
   - Initialize federal tax data (income tax, standard deductions, capital gains)
   - Start listening on port 8000

6. **Start the frontend application**
   ```bash
   cd retiremint/client
   npm run dev
   ```
   This starts the Vite development server on port 3000.

### Running the Application

Once all three services are running:
- **Frontend**: Open [http://localhost:3000](http://localhost:3000) in your browser
- **Backend API**: Available at [http://localhost:8000](http://localhost:8000)
- **MongoDB**: Running on `localhost:27017`

**Note**: All three commands (`mongod`, `npm start` (or `npm run start:local-insecure`), and `npm run dev`) must be running simultaneously for the application to work properly.

## How It Works

### 1. User Authentication
- Users authenticate via **Google OAuth**
- On first login, a new user document is created in MongoDB
- User profile includes: name, email, date of birth, state of residence, marital status
- Users can customize state tax brackets by uploading YAML files

### 2. Scenario Creation
Users create financial scenarios through the React frontend, which include:

**Basic Information:**
- Scenario name and type (single/married)
- Birth year(s) and life expectancy settings
- Initial cash amount
- Financial goal (target asset amount)
- State of residence

**Investments:**
- Multiple investment accounts (401k, IRA, taxable accounts, etc.)
- Each investment has:
  - Name and current value
  - Investment type (stocks, bonds, etc.) with expected returns
  - Tax status (pre-tax, Roth, after-tax, tax-exempt)
  - Maximum annual contribution limits
  - Expense ratios

**Events:**
Users can add life events that occur at specific times:
- **Income Events**: Salary, Social Security, pensions, etc.
  - Initial amount and annual change patterns
  - Inflation adjustment options
  - Start year and duration (can be probabilistic)
- **Expense Events**: Housing, healthcare, discretionary spending
  - Can be marked as discretionary (can be reduced if needed)
  - Annual change patterns
- **Investment Events**: Changes to contribution amounts or strategies
- **Rebalance Events**: Portfolio rebalancing strategies

**Simulation Settings:**
- Inflation assumptions (fixed, normal distribution, uniform)
- Expense withdrawal strategies
- RMD (Required Minimum Distribution) strategies
- Roth conversion strategies and optimizer
- Spending strategies

### 3. Data Storage
Scenarios are stored in MongoDB using a nested document structure:
- **Scenario** document references:
  - **LifeExpectancy** documents (user and spouse)
  - **Investment** documents, which reference:
    - **InvestmentType** documents, which reference:
      - **ExpectedReturnOrIncome** documents (for returns and income)
  - **EventSeries** documents, which reference:
    - **StartYear** and **Duration** documents
    - **Income**, **Expense**, **Invest**, or **Rebalance** documents
    - **ExpectedAnnualChange** documents
  - **SimulationSettings** document, which references:
    - **Inflation** document

This structure allows for efficient querying and data reuse (e.g., multiple investments can share the same InvestmentType).

### 4. Monte Carlo Simulation Process

When a user runs a simulation:

1. **Data Fetching**: The backend fetches the complete scenario from MongoDB, populating all referenced documents.

2. **Worker Thread Creation**: The `SimulationEngine.js` creates multiple worker threads (one per simulation). Each worker runs independently in parallel.

3. **Single Simulation Execution** (`RunOneSimulation.js`):
   - Determines simulation duration based on life expectancy
   - For each year in the simulation:
     - Calculates inflation rate (based on user's inflation assumption)
     - Processes income events (salary, Social Security, etc.)
     - Processes expense events (housing, healthcare, etc.)
     - Calculates investment returns (with market volatility)
     - Applies taxes (federal and state income tax, capital gains)
     - Handles RMDs (for retirement accounts after age 72)
     - Executes Roth conversions (if optimizer is enabled)
     - Rebalances portfolio (if rebalance events are active)
     - Updates investment values
     - Tracks cash flow and total assets
   - Returns yearly results and final state

4. **Result Aggregation**: After all simulations complete:
   - Success rate is calculated (percentage of simulations that met financial goal)
   - Percentile statistics are computed (10th, 25th, 50th, 75th, 90th percentiles)
   - Asset trajectories are generated for visualization
   - Income, expense, and tax data are aggregated

5. **Report Generation**: Results are saved as a **Report** document in MongoDB, which includes:
   - Success probability over time
   - Asset trajectory statistics
   - Income/expense/tax statistics
   - Individual simulation results (for detailed analysis)

### 5. Tax Calculations

The system performs sophisticated tax calculations:

**Federal Taxes:**
- Income tax brackets (progressive tax system)
- Standard deductions (single vs. married filing jointly)
- Capital gains tax (long-term vs. short-term)
- Social Security taxation (based on income thresholds)
- Tax data is scraped from IRS websites and stored in MongoDB

**State Taxes:**
- Users can upload custom state tax brackets via YAML files
- State tax calculations are applied in addition to federal taxes
- Default state tax data is loaded for common states (NY, CA, TX, NJ, CT)

**Tax Optimization:**
- The system considers tax-advantaged accounts (401k, IRA, Roth)
- Roth conversions are optimized to minimize lifetime taxes
- Required Minimum Distributions (RMDs) are calculated based on IRS tables

### 6. Visualization

The frontend displays simulation results using multiple chart types:

- **Success Probability Graph**: Shows probability of meeting financial goal over time
- **Asset Trajectory Charts**: Displays percentiles (10th, 25th, 50th, 75th, 90th) of total assets over time
- **Income/Expense Charts**: Shows projected income and expenses
- **Tax Charts**: Displays tax payments over time
- **Individual Investment Charts**: Shows value of each investment account
- **3D Surface Plots**: For two-dimensional parameter exploration
- **Contour Plots**: For visualizing parameter sensitivity

### 7. Scenario Sharing

Users can share scenarios with other users:
- Scenarios have a `sharedUsers` array with email and permission level (view/edit)
- Reports can also be shared independently
- Shared users can view or edit scenarios based on permissions

### 8. Import/Export

Scenarios can be exported to and imported from YAML format:
- **Export**: Converts MongoDB scenario documents to YAML files
- **Import**: Parses YAML files and creates new scenario documents
- Allows for version control and scenario backup

## Key Features

### Financial Modeling
-  Multiple investment accounts with different tax treatments
-  Probabilistic life expectancy modeling
-  Inflation-adjusted projections
-  Market volatility simulation (normal distributions for returns)
-  Life event modeling (career changes, major purchases, etc.)

### Tax Optimization
-  Federal and state tax calculations
-  Roth conversion optimizer
-  Required Minimum Distribution (RMD) handling
-  Tax-advantaged account management
-  Capital gains tax calculations

### Advanced Simulation
-  Monte Carlo method (thousands of simulations)
-  Multithreaded parallel execution
-  Probabilistic inputs (normal distributions, uniform distributions)
-  Success probability calculations
-  Percentile-based statistics

### User Experience
-  Google OAuth authentication
-  Drag-and-drop interface
-  Interactive charts and visualizations
-  Scenario sharing and collaboration
-  YAML import/export

### Analysis Tools
-  One-dimensional parameter exploration
-  Two-dimensional parameter exploration (surface plots)
-  Detailed year-by-year breakdowns

## API Endpoints

### User Routes (`/user`)
- `GET /user/:id` - Get user profile
- `GET /user/:userId/scenarios` - Get all scenarios for a user
- `POST /login` - Google OAuth login

### Scenario Routes (`/scenario`)
- `POST /scenario` - Create or update a scenario
- `POST /scenario/shareToUser` - Share scenario with another user
- `POST /scenario/removeSharedUser` - Remove shared user access

### Simulation Routes (`/simulation`)
- `POST /simulation/run` - Run Monte Carlo simulation for a scenario
- `GET /simulation/report/:id` - Get simulation report by ID
- `GET /simulation/report/:id/scenario` - Get scenario data for a report
- `POST /simulation/scenario/data` - Get full scenario data
- `POST /simulation/scenario/investments` - Get investments for a scenario
- `POST /simulation/scenario/events` - Get events for a scenario
- `POST /simulation/scenario/settings` - Get simulation settings
- `POST /simulation/scenario/lifeexpectancy` - Get life expectancy data
- `POST /simulation/explore-scenario/create` - Create scenario for parameter exploration
- `DELETE /simulation/explore-scenario/remove` - Remove exploration scenario

### Import/Export Routes
- `POST /import/scenario` - Import scenario from YAML
- `GET /export/scenario/:scenarioId` - Export scenario to YAML
- `GET /download-state-tax-yaml` - Download state tax YAML template
- `POST /upload-state-tax-yaml` - Upload custom state tax YAML

### Utility Routes
- `GET /api/test-db` - Test MongoDB connection
- `GET /api/db-data` - Fetch and log all database collections

## Development Notes

### Database Initialization
On server startup, the backend automatically:
1. Connects to MongoDB
2. Loads state tax data from YAML files
3. Scrapes RMD tables from IRS websites
4. Initializes federal tax data (income tax brackets, standard deductions, capital gains)

### Worker Threads
The simulation engine uses Node.js worker threads for parallel execution. Each worker:
- Receives scenario data and simulation index
- Runs a complete Monte Carlo simulation independently
- Returns results to the main thread
- Results are aggregated after all workers complete

### Error Handling
- Frontend displays user-friendly error messages
- Backend logs detailed errors to console
- Simulation failures are tracked but don't stop other simulations
- Database validation ensures data integrity

## Future Enhancements

Potential improvements for RetireMint:
- Real-time collaboration on scenarios
- Mobile app version
- Integration with financial institutions (account linking)
- More sophisticated tax strategies
- Additional visualization types
- Export to PDF reports
- Scenario templates and examples
- Monte Carlo parameter tuning recommendations

---

**RetireMint** - Making retirement planning accessible to everyone through advanced financial modeling and simulation.
