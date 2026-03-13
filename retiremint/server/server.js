const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { fetchAllCollections, fetchAndLogModelData } = require('./src/FetchModelData'); // Import fetchAllCollections and fetchAndLogModelData

if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_SELF_SIGNED_CERTS === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.warn('TLS certificate verification is disabled for local development.');
}

// initialize app
const app = express();
const port = 8000;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

// middleware
app.use(cors({
    origin: ['http://localhost:3000', 'https://accounts.google.com'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

// connect to MongoDB database 
mongoose.connect('mongodb://localhost:27017/retiremint')
  .then(async () => {
    console.log('MongoDB connected.');
    await loadStateTaxDataOnce();
    await scrapeAndSaveRMDTable();
    await IncomeTax();
    await StandardDeduction();
    await CapitalGain();

    // Create 'logs' directory if it doesn't exist
    
    const logDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  })
  .catch(err => console.error('MongoDB connection error:', err));


// scenario model
const Scenario = require('./src/Schemas/Scenario');
const LifeExpectancy = require('./src/Schemas/LifeExpectancy');
const Investment = require('./src/Schemas/Investments');
const InvestmentType = require('./src/Schemas/InvestmentType');
const ExpectedReturn = require('./src/Schemas/ExpectedReturnOrIncome');
const Inflation = require('./src/Schemas/Inflation');
const SimulationSettings = require('./src/Schemas/SimulationSettings');
const Event=require('./src/Schemas/EventSeries');
const StartYear=require('./src/Schemas/StartYear');
const Duration=require('./src/Schemas/Duration');
const Income=require('./src/Schemas/Income');
const Expense=require('./src/Schemas/Expense');
const Invest=require('./src/Schemas/Invest');
const Rebalance=require('./src/Schemas/Rebalance');
const ExpectedAnnualChange = require('./src/Schemas/ExpectedAnnualChange');
const Allocation=require('./src/Schemas/Allocation');
const User = require('./src/Schemas/Users');
const Report = require('./src/Schemas/Report'); // Add Report schema
const IncomeTax = require('./src/FederalTaxes/incomeTax');
const UserStateTax = require('./src/Schemas/UserStateTax');

const StandardDeduction = require('./src/FederalTaxes/standardDeduction');
const CapitalGain = require('./src/FederalTaxes/capitalGain');
const {OAuth2Client} = require('google-auth-library');
const userRoutes = require('./src/Routes/User'); 
const simulationRoutes = require('./src/Routes/Simulation'); // Add simulation routes
const loadStateTaxDataOnce = require('./src/Utils/loadStateTaxes');
const scrapeAndSaveRMDTable = require('./src/Utils/scrapeRMDTable');
const ExpectedReturnOrIncome = require('./src/Schemas/ExpectedReturnOrIncome');
const importRoutes = require('./src/Routes/Import');
const exportRoute = require('./src/Routes/Export');

app.use('/user', userRoutes);
app.use('/simulation', simulationRoutes); // Add simulation routes
app.use('/import', importRoutes);
app.use('/export', exportRoute);

// Route to fetch and print all database collections
app.get('/api/db-data', async (req, res) => {
  try {
    console.log('Fetching all database collections...');
    await fetchAllCollections();
    console.log('Database collections fetched successfully');
    res.status(200).json({ message: 'Database collections data printed to console' });
  } catch (error) {
    console.error('Error fetching database collections:', error);
    res.status(500).json({ error: 'Error fetching database collections' });
  }
});

// Test route to verify MongoDB connection and User model
app.get('/api/test-db', async (req, res) => {
  try {
    // Check MongoDB connection
    const dbState = mongoose.connection.readyState;
    let dbStatus;
    
    switch (dbState) {
      case 0:
        dbStatus = 'Disconnected';
        break;
      case 1:
        dbStatus = 'Connected';
        break;
      case 2:
        dbStatus = 'Connecting';
        break;
      case 3:
        dbStatus = 'Disconnecting';
        break;
      default:
        dbStatus = 'Unknown';
    }
    
    // Test User model
    const userCount = await User.countDocuments();
    
    return res.status(200).json({
      status: 'success',
      message: 'Database connection test successful',
      dbStatus,
      userCollection: {
        count: userCount,
        modelExists: !!User
      }
    });
  } catch (error) {
    console.error('Database test failed:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Database connection test failed',
      error: error.message
    });
  }
});

app.post('/login',async function(req,res){
    console.log('Login request received:', req.body);
    const token = req.body.credential;
    
    if (!token) {
        console.error('Missing token');
        return res.status(400).json({ error: 'Missing token' });
    }

    if (!GOOGLE_CLIENT_ID) {
        console.error('Server misconfiguration: GOOGLE_CLIENT_ID is not set');
        return res.status(500).json({ error: 'Server authentication is not configured' });
    }
    
    const client = new OAuth2Client();

    try {
        console.log('Verifying token with Google...');
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: GOOGLE_CLIENT_ID,
        });
    
        const payload = ticket.getPayload();
        const googleId = payload['sub'];
        const email = payload['email'];
        const name = payload['name'];
        const picture = payload['picture'];
    
        console.log(`User authenticated: ${email} (${googleId})`);
        
        let user = await User.findOne({ googleId });

        let isFirstLogin = false;
        if (!user) {
            isFirstLogin = true;
            console.log(`Creating new user: ${email}`);
        user = new User({
            googleId,
            email,
            name,
            picture,
        });
        await user.save();
            console.log('New user created with ID:', user._id);
        } else {
            console.log(`Existing user logged in: ${email}`);
            // Update user info in case it changed
            user.name = name;
            user.picture = picture;
            await user.save();
            console.log('User data updated, ID:', user._id);
        }
        
        // Send response
        const responseData = { 
            userId: user._id.toString(),
            isFirstTime: isFirstLogin,
            name: user.name,
            email: user.email
        };
        
        console.log('Sending login response:', responseData);
        return res.status(200).json(responseData);
        } catch (err) {
        console.error('Google authentication failed:', err);
        return res.status(401).json({ error: 'Authentication failed', details: err.message });
    }
});

// route to receive a scenario from frontend
app.post('/scenario', async (req, res) => {
    //console.log('Received req.body:', req.body); // Log the entire request body
    const { 
        scenarioId,
        scenarioName, 
        scenarioType, 
        birthYear, 
        spouseBirthYear, 
        lifeExpectancy, 
        spouseLifeExpectancy, 
        investments, 
        events,
        inflationAssumption,
        expenseWithdrawalStrategies,
        rmdStrategies,
        rothConversionStrategies,
        RothOptimizerEnable,
        rothRptimizerStartYear,
        rothOptimizerEndYear,
        financialGoal,
        stateOfResidence,
        sharedUsers,
        userId,  // Add userId to the extracted parameters
        initialCash, // <-- ADD initialCash here
        spendingStrategy // Add spendingStrategy
    } = req.body; // extracting data from frontend

    // open existing scenario if an edit is being attempted
    let existingScenario;
    if (scenarioId !== 'new') {
        try {
            existingScenario = await Scenario.findById(scenarioId);
            if (!existingScenario) {
                return (res.status(404).json({ error : 'Scenario to be edited not Found'}))
            }
        }
        catch (error) {
            res.status(500).json({ error: 'Error fetching scenario' });
        }
    }

    // Delete Investments/Events and any items from other schemas inside that are to be replaced. (Reasoning: The new version may have more/less Investments or Events than the original, may not be 1:1 update)
    if (existingScenario) {
        try {
            // Delete only the Investment documents, not the referenced InvestmentType/ExpectedReturn
            for (let i = 0; i < existingScenario.investments.length; i++) {
                // Keep the Investment lookup to ensure it exists before deleting
                const existingInvestment = await Investment.findById(existingScenario.investments[i]);
                if (existingInvestment) {
                    // No longer delete InvestmentType or ExpectedReturn here
                    /* 
                    let existingInvestmentType = await InvestmentType.findById(existingInvestment.investmentType);
                    if (existingInvestmentType) {
                        await ExpectedReturn.findByIdAndDelete(existingInvestmentType.expectedAnnualReturn);
                        await ExpectedReturn.findByIdAndDelete(existingInvestmentType.expectedAnnualIncome); // Also delete income return
                        await InvestmentType.findByIdAndDelete(existingInvestment.investmentType);
                    }
                    */
                    await Investment.findByIdAndDelete(existingScenario.investments[i]);
                }
            }
            
            // Keep the event deletion logic as is
            let existingEvent;
            for (let i = 0; i < existingScenario.events.length; i++) {
                existingEvent = await Event.findById(existingScenario.events[i]);
                if (existingEvent) { // Check if event exists
                    // Delete associated documents only if they exist
                    if (existingEvent.startYear) await StartYear.findByIdAndDelete(existingEvent.startYear);
                    if (existingEvent.duration) await Duration.findByIdAndDelete(existingEvent.duration);
                    
                    const income = await Income.findById(existingEvent.income);
                    if (income) {
                        if (income.expectedAnnualChange) await ExpectedAnnualChange.findByIdAndDelete(income.expectedAnnualChange);
                        await Income.findByIdAndDelete(existingEvent.income);
                    }
                    
                    const expense = await Expense.findById(existingEvent.expense);
                    if (expense) {
                        if (expense.expectedAnnualChange) await ExpectedAnnualChange.findByIdAndDelete(expense.expectedAnnualChange);
                        await Expense.findByIdAndDelete(existingEvent.expense);
                    }
                    
                    // Delete Invest/Rebalance/Allocation only if they exist
                    const invest = await Invest.findById(existingEvent.invest);
                    if (invest && invest.allocations) await Allocation.findByIdAndDelete(invest.allocations);
                    if (existingEvent.invest) await Invest.findByIdAndDelete(existingEvent.invest);
                    
                    const rebalance = await Rebalance.findById(existingEvent.rebalance);
                    if (rebalance && rebalance.allocations) await Allocation.findByIdAndDelete(rebalance.allocations);
                    if (existingEvent.rebalance) await Rebalance.findByIdAndDelete(existingEvent.rebalance);
                    
                    // Finally, delete the event itself
                    await Event.findByIdAndDelete(existingScenario.events[i]);
                } // End if(existingEvent)
            } // End for loop for events
        } catch (error) {
            console.error("Error during deletion of old scenario sub-documents:", error); // Log the specific error
            // Decide if this error should halt the process or just be logged
            // return res.status(500).json({ error: 'Error cleaning up old scenario data' }); 
        }
    }
    


    // extract values from lifeExpectancy list
    const [lifeExpectancyMethod, fixedValue, normalDistribution] = lifeExpectancy;

    // create and save user life expectancy
    // If this is a new scenario, save instead of updating.
    let userLifeExpectancy;
    if (!existingScenario) {
        userLifeExpectancy = new LifeExpectancy({
            lifeExpectancyMethod,
            fixedValue,
            normalDistribution
        });
        await userLifeExpectancy.save();
    }
    else {
        try {
            userLifeExpectancy = await LifeExpectancy.findByIdAndUpdate(existingScenario.lifeExpectancy, {lifeExpectancyMethod: lifeExpectancyMethod , fixedValue: fixedValue, normalDistribution: normalDistribution}, {new: true});
        }
        catch (error) {
            res.status(500).json({ error: 'Error updating User Life Expectancy' });
        }
    }    
    // now check for spouse 
    let spousalLifeExpectancy = null;
    // check if spouse life expectancy exists and extract values
    if (scenarioType === 'married' && spouseLifeExpectancy !== null) {
        const [spouseLifeExpectancyMethod, spouseFixedValue, spouseNormalDistribution] = spouseLifeExpectancy;

        // Prepare spouse life expectancy data
        const spouseData = {
            lifeExpectancyMethod: spouseLifeExpectancyMethod,
            fixedValue: spouseFixedValue,
            normalDistribution: spouseNormalDistribution
        };

        if (!existingScenario) {
            // Create and save for a new scenario
            spousalLifeExpectancy = new LifeExpectancy(spouseData);
            await spousalLifeExpectancy.save(); // Correct variable name
        }   
        else {
            try {
                // Update existing spouse life expectancy
                if (existingScenario.spouseLifeExpectancy) {
                    spousalLifeExpectancy = await LifeExpectancy.findByIdAndUpdate(
                        existingScenario.spouseLifeExpectancy, 
                        spouseData, 
                        {new: true}
                    );
                } else {
                    // Handle case where spouse expectancy didn't exist before but does now
                    spousalLifeExpectancy = new LifeExpectancy(spouseData);
                    await spousalLifeExpectancy.save();
                }
            }
            catch (error) {
                console.error('Error updating/creating Spouse Life Expectancy:', error);
                // Decide how to handle this error, maybe return 500
                return res.status(500).json({ error: 'Error handling Spouse Life Expectancy' });
            }
        } 
    } else if (existingScenario && existingScenario.spouseLifeExpectancy) {
        // Handle case where spouse existed before but is now removed (scenarioType != 'married')
        try {
            await LifeExpectancy.findByIdAndDelete(existingScenario.spouseLifeExpectancy);
        } catch (deleteError) {
            console.error('Error deleting previous spouse life expectancy:', deleteError);
            // Potentially log this error but continue, as the main scenario update might still succeed
        }
    }

    // process investments from bottom-up
    
    const investmentIds = await Promise.all(investments.map(async inv => {

        // Step 1: Check if InvestmentType already exists
        let investmentType = await InvestmentType.findOne({ name: inv.investmentType.name });
        
        // Prepare the data for ExpectedReturn documents
        const returnData = {
            method: inv.investmentType.expectedReturn.returnType,
            fixedValue: inv.investmentType.expectedReturn.returnType === 'fixedValue' 
                ? inv.investmentType.expectedReturn.fixedValue 
                : null,
            fixedPercentage: inv.investmentType.expectedReturn.returnType === 'fixedPercentage' 
                ? inv.investmentType.expectedReturn.fixedPercentage 
                : null,
            normalValue: inv.investmentType.expectedReturn.returnType === 'normalValue' 
                ? { 
                    mean: inv.investmentType.expectedReturn.normalValue?.mean ?? null, 
                    sd: inv.investmentType.expectedReturn.normalValue?.sd ?? null 
                  } 
                : null,
            normalPercentage: inv.investmentType.expectedReturn.returnType === 'normalPercentage' 
                ? { 
                    mean: inv.investmentType.expectedReturn.normalPercentage?.mean ?? null, 
                    sd: inv.investmentType.expectedReturn.normalPercentage?.sd ?? null 
                  } 
                : null,
        };

        const incomeData = {
            method: inv.investmentType.expectedIncome.returnType,
            fixedValue: inv.investmentType.expectedIncome.returnType === 'fixedValue' 
                ? inv.investmentType.expectedIncome.fixedValue 
                : null,
            fixedPercentage: inv.investmentType.expectedIncome.returnType === 'fixedPercentage' 
                ? inv.investmentType.expectedIncome.fixedPercentage 
                : null,
            normalValue: inv.investmentType.expectedIncome.returnType === 'normalValue' 
                ? { 
                    mean: inv.investmentType.expectedIncome.normalValue?.mean ?? null, 
                    sd: inv.investmentType.expectedIncome.normalValue?.sd ?? null 
                  } 
                : null,
            normalPercentage: inv.investmentType.expectedIncome.returnType === 'normalPercentage' 
                ? { 
                    mean: inv.investmentType.expectedIncome.normalPercentage?.mean ?? null, 
                    sd: inv.investmentType.expectedIncome.normalPercentage?.sd ?? null 
                  } 
                : null,
        };

        let expectedReturn, expectedIncome;
        
        if (investmentType) {
            // InvestmentType exists - check if its ExpectedReturn documents are shared with other types
            // We need to check BOTH same-field sharing AND cross-field sharing
            // This is a safety check to fix any corrupted data from previous bugs
            
            const returnDocId = investmentType.expectedAnnualReturn;
            const incomeDocId = investmentType.expectedAnnualIncome;
            
            // Check if returnDocId is used by ANY other InvestmentType (in either field)
            const returnUsedByOtherAsReturn = await InvestmentType.countDocuments({ 
                expectedAnnualReturn: returnDocId,
                _id: { $ne: investmentType._id }
            });
            const returnUsedByOtherAsIncome = await InvestmentType.countDocuments({ 
                expectedAnnualIncome: returnDocId,
                _id: { $ne: investmentType._id }
            });
            const returnIsShared = returnUsedByOtherAsReturn > 0 || returnUsedByOtherAsIncome > 0;
            
            // Check if incomeDocId is used by ANY other InvestmentType (in either field)
            const incomeUsedByOtherAsReturn = await InvestmentType.countDocuments({ 
                expectedAnnualReturn: incomeDocId,
                _id: { $ne: investmentType._id }
            });
            const incomeUsedByOtherAsIncome = await InvestmentType.countDocuments({ 
                expectedAnnualIncome: incomeDocId,
                _id: { $ne: investmentType._id }
            });
            const incomeIsShared = incomeUsedByOtherAsReturn > 0 || incomeUsedByOtherAsIncome > 0;
            
            // Also check if return and income point to the SAME document (self-sharing)
            const selfSharing = returnDocId && incomeDocId && returnDocId.toString() === incomeDocId.toString();
            
            if (returnIsShared || selfSharing) {
                // This ExpectedReturn is shared - create a new unique one for this InvestmentType
                expectedReturn = await new ExpectedReturn(returnData).save();
            } else {
                // Safe to update - only this InvestmentType uses it
                expectedReturn = await ExpectedReturn.findByIdAndUpdate(
                    returnDocId,
                    returnData,
                    { new: true }
                );
            }
            
            if (incomeIsShared || selfSharing) {
                // This ExpectedReturn is shared - create a new unique one for this InvestmentType
                expectedIncome = await new ExpectedReturn(incomeData).save();
            } else {
                // Safe to update - only this InvestmentType uses it
                expectedIncome = await ExpectedReturn.findByIdAndUpdate(
                    incomeDocId,
                    incomeData,
                    { new: true }
                );
            }
            
            // Update the InvestmentType with potentially new ExpectedReturn references
            investmentType = await InvestmentType.findByIdAndUpdate(
                investmentType._id,
                {
                    description: inv.investmentType.description,
                    expectedAnnualReturn: expectedReturn._id,
                    expectedAnnualIncome: expectedIncome._id,
                    expenseRatio: inv.investmentType.expenseRatio,
                    taxability: inv.investmentType.taxability
                },
                { new: true }
            );
        } else {
            // InvestmentType doesn't exist - CREATE new documents
            expectedReturn = await new ExpectedReturn(returnData).save();
            expectedIncome = await new ExpectedReturn(incomeData).save();
            
            investmentType = await new InvestmentType({
                name: inv.investmentType.name,
                description: inv.investmentType.description,
                expectedAnnualReturn: expectedReturn._id,
                expectedAnnualIncome: expectedIncome._id,
                expenseRatio: inv.investmentType.expenseRatio,
                taxability: inv.investmentType.taxability
            }).save();
        }
    
        // Step 4: Create Investment (referencing the found/created InvestmentType)
        const investmentData = {
            name: inv.name,
            investmentType: investmentType._id, // Use the ID from findOneAndUpdate
            value: inv.value,
            maxAnnualContribution: inv.maxAnnualContribution
        };

        // Only include accountTaxStatus for taxable investments
        if (inv.investmentType.taxability !== 'tax-exempt') {
            investmentData.accountTaxStatus = inv.taxStatus;
        }

        // Always create a new Investment document, as we delete old ones during edits
        const investment = await new Investment(investmentData).save(); 

        return investment._id;
    }));



    //create events
    const eventIds = await Promise.all(events.map(async eve => {

        const startYear = await new StartYear({
            method: eve.startYear.returnType,
            fixedValue: eve.startYear.returnType === 'fixedValue' 
                ? eve.startYear.fixedValue 
                : null,
            normalValue: eve.startYear.returnType === 'normalValue' 
                ? eve.startYear.normalValue 
                : null,
            uniformValue: eve.startYear.returnType === 'uniformValue' 
                ? eve.startYear.uniformValue 
                : null,
            sameYearAsAnotherEvent: eve.startYear.returnType === 'sameYearAsAnotherEvent' 
                ? eve.startYear.sameYearAsAnotherEvent 
                : null,
            yearAfterAnotherEventEnd: eve.startYear.returnType === 'yearAfterAnotherEventEnd' 
                ? eve.startYear.yearAfterAnotherEventEnd 
                : null,
        }).save();


        const durationObj = await new Duration({
            method: eve.duration.returnType,
            fixedValue: eve.duration.returnType === 'fixedValue' 
                ? eve.duration.fixedValue 
                : null,
            normalValue: eve.duration.returnType === 'normalValue' 
                ? eve.duration.normalValue 
                : null,
            uniformValue: eve.duration.returnType === 'uniformValue' 
                ? eve.duration.uniformValue 
                : null,
        }).save();


        // default all objects to null
        let incomeObj = null;
        let expenseObj = null;
        let investObj = null;
        let rebalanceObj = null;

        if(eve.eventType==="income"){
            const expectedAnnualChangeForIncome = await new ExpectedAnnualChange({
                method: eve.income.expectedAnnualChange.returnType,
                fixedValue: eve.income.expectedAnnualChange.returnType === 'fixedValue' 
                    ? eve.income.expectedAnnualChange.fixedValue 
                    : null,
                fixedPercentage: eve.income.expectedAnnualChange.returnType === 'fixedPercentage' 
                    ? eve.income.expectedAnnualChange.fixedPercentage 
                    : null,
                normalValue: eve.income.expectedAnnualChange.returnType === 'normalValue' 
                    ? eve.income.expectedAnnualChange.normalValue 
                    : null,
                normalPercentage: eve.income.expectedAnnualChange.returnType === 'normalPercentage' 
                    ? eve.income.expectedAnnualChange.normalPercentage 
                    : null,
                uniformValue: eve.income.expectedAnnualChange.returnType === 'uniformValue' 
                    ? eve.income.expectedAnnualChange.uniformValue 
                    : null,
                uniformPercentage: eve.income.expectedAnnualChange.returnType === 'uniformPercentage' 
                    ? eve.income.expectedAnnualChange.uniformPercentage 
                    : null,
            }).save();
            


            incomeObj = await new Income({
                initialAmount: eve.income.initialAmount,
                expectedAnnualChange: expectedAnnualChangeForIncome.id,
                inflationAdjustment: eve.income.inflationAdjustment,
                marriedPercentage: eve.income.marriedPercentage,
                isSocialSecurity: eve.income.isSocialSecurity
    
            }).save()

        }else if(eve.eventType==="expense"){
            const expectedAnnualChangeForExpense = await new ExpectedAnnualChange({
                method: eve.expense.expectedAnnualChange.returnType,
                fixedValue: eve.expense.expectedAnnualChange.returnType === 'fixedValue' 
                    ? eve.expense.expectedAnnualChange.fixedValue 
                    : null,
                fixedPercentage: eve.expense.expectedAnnualChange.returnType === 'fixedPercentage' 
                    ? eve.expense.expectedAnnualChange.fixedPercentage 
                    : null,
                normalValue: eve.expense.expectedAnnualChange.returnType === 'normalValue' 
                    ? eve.expense.expectedAnnualChange.normalValue 
                    : null,
                normalPercentage: eve.expense.expectedAnnualChange.returnType === 'normalPercentage' 
                    ? eve.expense.expectedAnnualChange.normalPercentage 
                    : null,
                uniformValue: eve.expense.expectedAnnualChange.returnType === 'uniformValue' 
                    ? eve.expense.expectedAnnualChange.uniformValue 
                    : null,
                uniformPercentage: eve.expense.expectedAnnualChange.returnType === 'uniformPercentage' 
                    ? eve.expense.expectedAnnualChange.uniformPercentage 
                    : null,
            }).save();
            

            expenseObj =await  new Expense({
                initialAmount: eve.expense.initialAmount,
                expectedAnnualChange: expectedAnnualChangeForExpense.id,
                inflationAdjustment: eve.expense.inflationAdjustment,
                marriedPercentage: eve.expense.marriedPercentage,
                isDiscretionary: eve.expense.isDiscretionary
    
            }).save()

        }else if(eve.eventType==="invest"){

            const investAllocation = await new Allocation({
                method: eve.invest.executionType || 'fixedAllocation',
                fixedAllocation: eve.invest.returnType === 'fixedAllocation' && eve.invest.fixedAllocation
                    ? eve.invest.fixedAllocation.split(';').map(s => s.trim()).filter(s => s)
                    : [],
                glidePath: eve.invest.returnType === 'glidePath' && eve.invest.glidePath
                    ? eve.invest.glidePath.split(';').map(s => s.trim()).filter(s => s)
                    : []
            }).save();
            
    
            investObj =await  new Invest({
                allocations: investAllocation.id,
                modifyMaximumCash: eve.invest.modifyMaximumCash, // Keep for potential internal use
                newMaximumCash: eve.invest.newMaximumCash, // Save the value directly
                investmentStrategy: {
                    // Only include allocations that are explicitly modified
                    taxStatusAllocation: eve.invest.modifyTaxStatusAllocation ? eve.invest.investmentStrategy?.taxStatusAllocation || {} : null,
                    preTaxAllocation: eve.invest.modifyPreTaxAllocation ? eve.invest.investmentStrategy?.preTaxAllocation || {} : null,
                    afterTaxAllocation: eve.invest.modifyAfterTaxAllocation ? eve.invest.investmentStrategy?.afterTaxAllocation || {} : null,
                    nonRetirementAllocation: eve.invest.modifyNonRetirementAllocation ? eve.invest.investmentStrategy?.nonRetirementAllocation || {} : null,
                    taxExemptAllocation: eve.invest.modifyTaxExemptAllocation ? eve.invest.investmentStrategy?.taxExemptAllocation || {} : null
                },
                // For finalInvestmentStrategy in glide path, also check modify flags
                finalInvestmentStrategy: eve.invest.executionType === 'glidePath' ? {
                    taxStatusAllocation: eve.invest.modifyTaxStatusAllocation ? eve.invest.finalInvestmentStrategy?.taxStatusAllocation || {} : null,
                    preTaxAllocation: eve.invest.modifyPreTaxAllocation ? eve.invest.finalInvestmentStrategy?.preTaxAllocation || {} : null,
                    afterTaxAllocation: eve.invest.modifyAfterTaxAllocation ? eve.invest.finalInvestmentStrategy?.afterTaxAllocation || {} : null,
                    nonRetirementAllocation: eve.invest.modifyNonRetirementAllocation ? eve.invest.finalInvestmentStrategy?.nonRetirementAllocation || {} : null,
                    taxExemptAllocation: eve.invest.modifyTaxExemptAllocation ? eve.invest.finalInvestmentStrategy?.taxExemptAllocation || {} : null
                } : null
            }).save()
            
        }else if(eve.eventType==="rebalance"){
            // Reinstate Allocation creation for execution type/method
            const rebalanceAllocation = await new Allocation({
                // Use executionType for method, default if not present
                method: eve.rebalance.executionType || 'fixedAllocation', 
                // NOTE: The following fields might need adjustment if the frontend sends 
                //       string-based allocations differently for rebalance vs invest.
                //       Assuming similar structure for now.
                fixedAllocation: eve.rebalance.returnType === 'fixedAllocation' && eve.rebalance.fixedAllocation
                    ? eve.rebalance.fixedAllocation.split(';').map(s => s.trim()).filter(s => s)
                    : [],
                glidePath: eve.rebalance.returnType === 'glidePath' && eve.rebalance.glidePath
                    ? eve.rebalance.glidePath.split(';').map(s => s.trim()).filter(s => s)
                    : []
            }).save();
            
            // Save Rebalance event with BOTH allocation reference AND rebalanceStrategy
            rebalanceObj = await new Rebalance({
                allocations: rebalanceAllocation.id, // Save reference to Allocation doc
                rebalanceStrategy: {
                    // Only include allocations that are explicitly modified
                    taxStatusAllocation: eve.rebalance.modifyTaxStatusAllocation ? eve.rebalance.rebalanceStrategy?.taxStatusAllocation || {} : null,
                    preTaxAllocation: eve.rebalance.modifyPreTaxAllocation ? eve.rebalance.rebalanceStrategy?.preTaxAllocation || {} : null,
                    afterTaxAllocation: eve.rebalance.modifyAfterTaxAllocation ? eve.rebalance.rebalanceStrategy?.afterTaxAllocation || {} : null,
                    nonRetirementAllocation: eve.rebalance.modifyNonRetirementAllocation ? eve.rebalance.rebalanceStrategy?.nonRetirementAllocation || {} : null,
                    taxExemptAllocation: eve.rebalance.modifyTaxExemptAllocation ? eve.rebalance.rebalanceStrategy?.taxExemptAllocation || {} : null
                },
                // For finalRebalanceStrategy in glide path, also check modify flags
                finalRebalanceStrategy: eve.rebalance.executionType === 'glidePath' ? {
                    taxStatusAllocation: eve.rebalance.modifyTaxStatusAllocation ? eve.rebalance.finalRebalanceStrategy?.taxStatusAllocation || {} : null,
                    preTaxAllocation: eve.rebalance.modifyPreTaxAllocation ? eve.rebalance.finalRebalanceStrategy?.preTaxAllocation || {} : null,
                    afterTaxAllocation: eve.rebalance.modifyAfterTaxAllocation ? eve.rebalance.finalRebalanceStrategy?.afterTaxAllocation || {} : null,
                    nonRetirementAllocation: eve.rebalance.modifyNonRetirementAllocation ? eve.rebalance.finalRebalanceStrategy?.nonRetirementAllocation || {} : null,
                    taxExemptAllocation: eve.rebalance.modifyTaxExemptAllocation ? eve.rebalance.finalRebalanceStrategy?.taxExemptAllocation || {} : null
                } : null
                // Add other fields if needed (modify flags, etc.)
            }).save()
        }       



        const event = await new Event({
            name: eve.name,
            description: eve.description,
            startYear: startYear.id,
            duration: durationObj.id,
            type: eve.eventType,
            income: incomeObj ? incomeObj.id : null,
            expense: expenseObj ? expenseObj.id : null,
            invest: investObj ? investObj.id : null,
            rebalance: rebalanceObj ? rebalanceObj.id : null

        }).save();
        return event._id;
    }));
    
    //create inflation object
    // Create and save Inflation object
    let existingSimulationSettings;
    if (existingScenario) {
        try {
            existingSimulationSettings = await SimulationSettings.findById(existingScenario.simulationSettings);
        }
        catch (error) {
            res.status(500).json({ error: 'Error fetching original simulation settings.' });
        }
    }
    let inflation;
    if (!existingSimulationSettings) {
         inflation = new Inflation({
            method: inflationAssumption.method,
            fixedPercentage: inflationAssumption.fixedPercentage,
            normalPercentage: inflationAssumption.normalPercentage,
            uniformPercentage: inflationAssumption.uniformPercentage
        });
    await inflation.save();
    }
    else {
        const inflationData = {
            method: inflationAssumption.method,
            fixedPercentage: inflationAssumption.fixedPercentage,
            normalPercentage: inflationAssumption.normalPercentage,
            uniformPercentage: inflationAssumption.uniformPercentage
        };
        inflation = await Inflation.findByIdAndUpdate(
            existingSimulationSettings.inflationAssumption, 
            inflationData, 
            {new: true}
        );
    }

    //simulation setting
    let simulationSettings;
    if (!existingSimulationSettings) {
        simulationSettings = new SimulationSettings({
        inflationAssumption: inflation._id,
            expenseWithdrawalStrategies: expenseWithdrawalStrategies,
            spendingStrategy: spendingStrategy, // Add spendingStrategy
            rmdStrategies: rmdStrategies,
            rothConversionStrategies: rothConversionStrategies,
            rothOptimizerEnable: RothOptimizerEnable,
            rothOptimizerStartYear: rothRptimizerStartYear,
            rothOptimizerEndYear: rothOptimizerEndYear
        });
        await simulationSettings.save();
    }
    else {
        const settingsData = {
            inflationAssumption: inflation._id,
            expenseWithdrawalStrategies: expenseWithdrawalStrategies,
            spendingStrategy: spendingStrategy, // Add spendingStrategy
            rmdStrategies: rmdStrategies,
            rothConversionStrategies: rothConversionStrategies,
            rothOptimizerEnable: RothOptimizerEnable,
            rothOptimizerStartYear: rothRptimizerStartYear,
            rothOptimizerEndYear: rothOptimizerEndYear
        };
        simulationSettings = await SimulationSettings.findByIdAndUpdate(
            existingSimulationSettings._id, 
            settingsData, 
            {new: true}
        );
    }

    try {
        if (!existingScenario) {
            const newScenario = new Scenario({
                name: scenarioName,
                userId: userId, // Add userId to the new scenario
                scenarioType: scenarioType, 
                birthYear: birthYear,
                spouseBirthYear: spouseBirthYear, 
                lifeExpectancy: userLifeExpectancy, 
                spouseLifeExpectancy: spousalLifeExpectancy ? spousalLifeExpectancy._id : null,
                investments: investmentIds,
                events: eventIds,
                simulationSettings: simulationSettings._id,
                financialGoal: financialGoal,
                initialCash: initialCash, // <-- ADD initialCash here
                stateOfResidence: stateOfResidence,
                sharedUsers: sharedUsers,
                stateTaxes: [] 
            });
            // Copy ALL tax references from user to scenario
            const user = await User.findById(userId).select('stateTaxes');
            if (user && user.stateTaxes.length > 0) {
                // Directly copy all tax references
                newScenario.stateTaxes = [...user.stateTaxes]; // Creates a new array copy
            }

            await newScenario.save();
            console.log('Scenario saved successfully with ID:', newScenario._id);    
            // Return the scenario ID to the client
            res.status(201).json({
                success: true,
                message: 'Scenario created successfully',
                scenarioId: newScenario._id
            });
        }
        else {
            const user = await User.findById(userId).select('stateTaxes');

            await Scenario.findByIdAndUpdate(existingScenario._id, {
                name: scenarioName,
                userId: userId, // Add userId to the new scenario
                scenarioType: scenarioType, 
                birthYear: birthYear,
                spouseBirthYear: spouseBirthYear, 
                lifeExpectancy: userLifeExpectancy, 
                spouseLifeExpectancy: spousalLifeExpectancy ? spousalLifeExpectancy._id : null,
                investments: investmentIds,
                events: eventIds,
                simulationSettings: simulationSettings._id,
                financialGoal: financialGoal,
                initialCash: initialCash, // <-- ADD initialCash here
                stateOfResidence: stateOfResidence,
                sharedUsers: sharedUsers,
                stateTaxes: user?.stateTaxes?.length > 0 ? [...user.stateTaxes] : []
                
            }, {new: true});
            console.log('Scenario updated with ID:', existingScenario._id); 
            
            // --- DEBUGGING: Log modelData after update ---
            if (existingScenario && existingScenario._id) {
                console.log(`--- Fetching and Logging Model Data for Updated Scenario: ${existingScenario._id} ---`);
                await fetchAndLogModelData(existingScenario._id); 
                console.log(`--- Finished Logging Model Data for Updated Scenario: ${existingScenario._id} ---`);
            }
            // --- END DEBUGGING ---

            // Return the original scenario ID to the client
            res.status(201).json({
                success: true,  
                message: 'Scenario created successfully',
                scenarioId: existingScenario._id
            });   
        }
    } catch (error) {
        console.error('Error saving scenario:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save scenario',
            details: error.message
        });
    }
});

// Returns a list of the InvestmentTypes and all inner documents for a given Scenario (not just IDs)
app.post('/simulation/scenario/investmentypes', async (req, res) => {
    try {
        const scenarioId = req.body.scenarioId;
        const scenario = await Scenario.findById(scenarioId);
        const investmentIds = scenario.investments;
        const investmentTypeIds = new Set();
        for (i = 0; i < investmentIds.length; i++) {
            let investment = await Investment.findById(investmentIds[i]);
            investmentTypeIds.add(investment.investmentType);
        }
        const investmentTypes = [];
        for (i = 0; i < investmentIds.length; i++) {
            let investmentType = await InvestmentType.findById(investmentIds[i]);
            investmentTypes.push(investmentType);
        }
        res.json({
            success: true,
            message: 'InvestmentTypes successfully found',
            investmentTypes: investmentTypes
        });
    } catch (error) {
        console.error('Error finding InvestmentTypes:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to find investmentTypes',
            details: error.message
        });
    }
}) 

// Returns a list of the Investments and the InvestmentTypes and all inner objects for a given Scenario (not just IDs)
app.post('/simulation/scenario/investments', async (req, res) => {
    try {
        const scenarioId = req.body.scenarioId;
        const scenario = await Scenario.findById(scenarioId);
        const investmentIds = scenario.investments;
        const investments = [];
        // Use a set to Store Investment Types to not contain duplicates upon fetching InvestmentTypes later.
        const investmentTypes = [];

        // Fetch all investments and store all investmentType Ids
        for (let i = 0; i < investmentIds.length; i++) {
            let investment = await Investment.findById(investmentIds[i]);
            // Add null check for investment itself
            if (!investment) {
                console.warn(`Investment not found for ID: ${investmentIds[i]}, skipping.`);
                continue; // Skip to next investment
            }
            
            let investmentType = await InvestmentType.findById(investment.investmentType);
            
            // --> ADD NULL CHECK HERE <--
            if (!investmentType) {
                console.warn(`InvestmentType not found for Investment ID: ${investment._id} (Type ID: ${investment.investmentType}), skipping population.`);
                // Optionally add the investment with null type to the list if needed for UI
                // investments.push(investment); 
                continue; // Skip population for this investment
            }
            // --> END NULL CHECK <--
            
            investment.investmentType = investmentType;
            let expectedReturn = await ExpectedReturnOrIncome.findById(investmentType.expectedAnnualReturn);
            let expectedIncome = await ExpectedReturnOrIncome.findById(investmentType.expectedAnnualIncome);
            
            // Add null checks before accessing properties
            if (expectedReturn) {
                investment.investmentType.expectedAnnualReturn = expectedReturn;
                investmentType.expectedAnnualReturn = expectedReturn; // Keep this sync?
            } else {
                console.warn(`ExpectedAnnualReturn not found for InvestmentType: ${investmentType._id}`);
                // Handle missing return: maybe set to null or a default object?
                investment.investmentType.expectedAnnualReturn = null; 
                investmentType.expectedAnnualReturn = null;
            }

            if (expectedIncome) {
                investment.investmentType.expectedAnnualIncome = expectedIncome;
                investmentType.expectedAnnualIncome = expectedIncome; // Keep this sync?
            } else {
                 console.warn(`ExpectedAnnualIncome not found for InvestmentType: ${investmentType._id}`);
                // Handle missing income: maybe set to null or a default object?
                investment.investmentType.expectedAnnualIncome = null;
                investmentType.expectedAnnualIncome = null;
            }
            
            investments.push(investment);
            // Check if InvestmentType for this investment already exists in the list.
            if (investmentTypes.findIndex((type) => type.name === investmentType.name) === -1) {
                investmentTypes.push(investmentType);
            }
        }
        // console.log("InvestmentTypes: ", investmentTypes); // Commented out this log
        res.json({
            success: true,
            message: 'Investment objects successfully found',
            investments: investments,
            investmentTypes: investmentTypes
        });
    } catch (error) {
        console.error('Error finding investments:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to find investment',
            details: error.message
        });
    }
}) 

// Returns a list of the Events and all inner objects for a given Scenario (not just IDs)
app.post('/simulation/scenario/events', async (req, res) => {
    try {
        const scenarioId = req.body.scenarioId;
        const scenario = await Scenario.findById(scenarioId);
        const eventIds = scenario.events;
        const events = [];
        for (let i = 0; i < eventIds.length; i++) {
            let event = await Event.findById(eventIds[i]);
            let startYear = await StartYear.findById(event.startYear);
            event.startYear = startYear;
            let duration = await Duration.findById(event.duration);
            event.duration = duration;
            let income = await Income.findById(event.income);
            event.income = income;
            if (income) {
                let incomeExpectedAnnualChange = await ExpectedAnnualChange.findById(income.expectedAnnualChange);
                event.income.expectedAnnualChange = incomeExpectedAnnualChange;
            }
            let expense = await Expense.findById(event.expense);
            event.expense = expense;
            if (expense) {
                let expenseExpectedAnnualChange = await ExpectedAnnualChange.findById(expense.expectedAnnualChange);
                event.expense.expectedAnnualChange = expenseExpectedAnnualChange;
            }
            let invest = await Invest.findById(event.invest);
            event.invest = invest;
            if (invest) {
                let investAllocations = await Allocation.findById(invest.allocations);
                event.invest.allocations = investAllocations;
            }
            let rebalance = await Rebalance.findById(event.rebalance);
            event.rebalance = rebalance;
            if (rebalance) {
                let rebalanceAllocations = await Allocation.findById(rebalance.allocations);
                event.rebalance.allocations = rebalanceAllocations;
            }
            events.push(event);
        }
        res.json({
            success: true,
            message: 'Event objects successfully found',
            events: events
        });
    } catch (error) {
        console.error('Error finding events:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to find events',
            details: error.message
        });
    }
}) 

// Returns the Simulation Settings for a given scenarioId
app.post('/simulation/scenario/settings', async (req, res) => {
    try {
        const scenarioId = req.body.scenarioId;
        const scenario = await Scenario.findById(scenarioId);
        const settingsId = scenario.simulationSettings;
        const settings = await SimulationSettings.findById(settingsId);

        res.json({
            success: true,
            message: 'Simulation Setting object successfully found',
            settings: settings
        });
    } catch (error) {
        console.error('Error finding simulation settings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to find simulation settings',
            details: error.message
        });
    }
})

app.post('/simulation/scenario/lifeexpectancy', async (req, res) => {
    try {
        const scenarioId = req.body.scenarioId;
        const scenario = await Scenario.findById(scenarioId);
        const lifeExpectancy = await LifeExpectancy.findById(scenario.lifeExpectancy);
       res.json({
            success: true,
            message: 'LifeExpectancy object successfully found',
            lifeExpectancy: lifeExpectancy
       });
    }
    catch (error) {
        console.error('Error finding lifeExpectancy:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to find lifeExpectancy',
            details: error.message
        });
    }
});

// Adds a shared user to a given scenario (given the scenarioId, userId (non-google), and permissions ('view' or 'edit'))
app.post('/scenario/shareToUser', async (req, res) => {
    try {
        const scenarioId = req.body.scenarioId;
        const userId = req.body.userId;
        const email = req.body.email;
        const permissions = req.body.permissions;
        console.log(`Received shareToUser input: ${scenarioId}, ${userId}, ${email}, ${permissions}.`);

        const scenario = await Scenario.findById(scenarioId);
        console.log(`Found Scenario: ${scenarioId}`);

        // Check if the user is already added to the Scenario.        
        const index = scenario.sharedUsers.findIndex((user) => user.email === email);
        if (index == -1) {
            scenario.sharedUsers.push({userId: userId, email: email, permissions: permissions});
        }
        else {
            scenario.sharedUsers[index] = {userId: userId, email: email, permissions: permissions};
        }
        scenario.save();
        console.log(`Successfully saved Scenario (shared users): ${scenario.sharedUsers}`);
        res.json({
            success: true,
            message: `Sucessfully added shared user ${userId} to scenario ${scenarioId}.`,
       })
        
    }
    catch (error) {
        console.error('Error adding user to scenario:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add shared user to scenario.',
            details: error.message
        });
    }
});

// Adds a shared user to all reports for a given Scenario (given the reportId, userId (non-google), and permissions ('view' or 'edit'))
app.post('/report/shareToUser', async (req, res) => {
    try {
        const scenarioId = req.body.scenarioId;
        const userId = req.body.userId;
        const email = req.body.email;
        const permissions = req.body.permissions;

        // Find all reports for a given scenario.
        const reports = await Report.find({scenarioId: scenarioId});
        // Check if the user is already added to the Report.
        reports.map((report) => {
            const index = report.sharedUsers.findIndex((user) => user.email === email);
            if (index == -1) {
                report.sharedUsers.push({userId: userId, email: email, permissions: permissions});
            }
            else {
                report.sharedUsers[index] = {userId: userId, email: email, permissions: permissions};
            }
            report.save();
        })
        res.json({
            success: true,
            message: `Sucessfully added shared user ${userId} to reports: ${reports.map((report) => report._id, ", ")}.`,
       })
    }
    catch (error) {
        console.error('Error adding user to report:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add shared user to report.',
            details: error.message
        });
    }
});

app.post('/scenario/removeSharedUser', async (req, res) => {
    try {
        const scenarioId = req.body.scenarioId;
        const userId = req.body.userId;
        const email = req.body.email;

        const scenario = await Scenario.findById(scenarioId);

        // Check if the user is already added to the Scenario.        
        const index = scenario.sharedUsers.findIndex((user) => user.email === email);
        if (index != -1) {
            scenario.sharedUsers.splice(index, 1); // Remove Shared User
        }
        else {
            console.log(`Removed User: ${email}`);
        }
        scenario.save();
        console.log(`Successfully removed Shared User from Scenario: ${scenario.sharedUsers}`);
        res.json({
            success: true,
            message: `Sucessfully removed shared user ${userId} from scenario ${scenarioId}.`,
       })
        
    }
    catch (error) {
        console.error('Error removing user from scenario:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to removed shared user from scenario.',
            details: error.message
        });
    }
});

app.post('/report/removeSharedUser', async (req, res) => {
    try {
        const scenarioId = req.body.scenarioId;
        const userId = req.body.userId;
        const email = req.body.email;

        const reports = await Report.find({scenarioId: scenarioId});

        // Check if the user is already added to the Report.   
        reports.map((report) => {
            const index = report.sharedUsers.findIndex((user) => user.email === email);
            if (index != -1) {
                report.sharedUsers.splice(index, 1); // Remove Shared User
            }
            report.save();
        })     
        console.log(`Successfully removed Shared user from reports: ${reports.map((report) => report._id, ", ")}`);
        res.json({
            success: true,
            message: `Sucessfully removed shared user ${userId} from all reports branching from ${scenarioId}.`,
       })
        
    }
    catch (error) {
        console.error('Error removed user from scenario: ', error);
        res.status(500).json({
            success: false,
            error: 'Failed to removed shared user from report.',
            details: error.message
        });
    }
});

// Create a temporary Scenario that is to be editted for 1D exploration.
app.post('/simulation/explore-scenario/create', async (req, res) => {
    try {
        const originalScenarioId = req.body.scenarioId;
        const scenarioParameter = req.body.scenarioParameter;
        const scenarioParameter2 = req.body.scenarioParameter2;
        const parameterId = req.body.parameterId;
        const parameterId2 = req.body.parameterId2;
        const changedValue = req.body.changedValue;
        const changedValue2 = req.body.changedValue2;

        console.log(`Creating explore scenario: param1=${scenarioParameter}(${changedValue}), param2=${scenarioParameter2}(${changedValue2})`);

        // Track newly created documents for cleanup
        const createdDocIds = {
            eventIds: [],
            startYearIds: [],
            durationIds: []
        };

        const scenario = await Scenario.findById(originalScenarioId);
        scenario._id = new mongoose.Types.ObjectId();

        if (scenarioParameter === 'event-start-year') {
            console.log("Editting Start Year (Param 1):", changedValue);
            const parameterEvent = await Event.findById(parameterId);
            const startYear = await new StartYear({method: 'fixedValue', fixedValue: changedValue}).save();
            createdDocIds.startYearIds.push(startYear._id);
            
            parameterEvent._id = new mongoose.Types.ObjectId();
            parameterEvent.startYear = startYear._id;
            parameterEvent.isNew = true;
            await parameterEvent.save();
            createdDocIds.eventIds.push(parameterEvent._id);
            
            // Replace original event in events list with new event with adjusted Start Year.
            const eventIndex = scenario.events.findIndex(e => e.toString() === parameterId);
            if (eventIndex !== -1) {
                scenario.events[eventIndex] = parameterEvent._id;
            }
            scenario.name = (scenario.name + " - StartYear=" + changedValue);
        }
        else if (scenarioParameter === 'event-duration') {
            console.log("Editting Duration (Param 1):", changedValue);
            const parameterEvent = await Event.findById(parameterId);
            const duration = await new Duration({method: 'fixedValue', fixedValue: changedValue}).save();
            createdDocIds.durationIds.push(duration._id);
            
            parameterEvent._id = new mongoose.Types.ObjectId();
            parameterEvent.duration = duration._id;
            parameterEvent.isNew = true;
            await parameterEvent.save();
            createdDocIds.eventIds.push(parameterEvent._id);
            
            // Replace original event in events list with new event with adjusted Duration.
            const eventIndex = scenario.events.findIndex(e => e.toString() === parameterId);
            if (eventIndex !== -1) {
                scenario.events[eventIndex] = parameterEvent._id;
            }
            scenario.name = (scenario.name + " - Duration=" + changedValue);
        }

        /* Check for Second Parameter  */
        if (scenarioParameter2 !== null) {
            if (scenarioParameter2 === 'event-start-year') {
                console.log("Editting Start Year (Param 2):", changedValue2);
                const parameterEvent2 = await Event.findById(parameterId2);
                const startYear2 = await new StartYear({method: 'fixedValue', fixedValue: changedValue2}).save();
                createdDocIds.startYearIds.push(startYear2._id);
                
                parameterEvent2._id = new mongoose.Types.ObjectId();
                parameterEvent2.startYear = startYear2._id;
                parameterEvent2.isNew = true;
                await parameterEvent2.save();
                createdDocIds.eventIds.push(parameterEvent2._id);
                
                // Replace original event in events list with new event with adjusted Start Year.
                const eventIndex2 = scenario.events.findIndex(e => e.toString() === parameterId2);
                if (eventIndex2 !== -1) {
                    scenario.events[eventIndex2] = parameterEvent2._id;
                }
                scenario.name = (scenario.name + " - StartYear2=" + changedValue2);
            }
            else if (scenarioParameter2 === 'event-duration') {
                console.log("Editting Duration (Param 2):", changedValue2);
                const parameterEvent2 = await Event.findById(parameterId2);
                const duration2 = await new Duration({method: 'fixedValue', fixedValue: changedValue2}).save();
                createdDocIds.durationIds.push(duration2._id);
                
                parameterEvent2._id = new mongoose.Types.ObjectId();
                parameterEvent2.duration = duration2._id;
                parameterEvent2.isNew = true;
                await parameterEvent2.save();
                createdDocIds.eventIds.push(parameterEvent2._id);
                
                // Replace original event in events list with new event with adjusted Duration.
                const eventIndex2 = scenario.events.findIndex(e => e.toString() === parameterId2);
                if (eventIndex2 !== -1) {
                    scenario.events[eventIndex2] = parameterEvent2._id;
                }
                scenario.name = (scenario.name + " - Duration2=" + changedValue2);
            }
        }
        scenario.isNew = true;
        await scenario.save();
        res.json({
            success: true,
            scenarioId: scenario._id,
            createdDocIds: createdDocIds,
            message: `Sucessfully created duplicated scenario ${originalScenarioId} as ${scenario._id}.`,
       });
    }
    catch (error) {
        console.error('Error duplicating and editing existing Scenario: ', error);
        res.status(500).json({
            success: false,
            error: 'Failed to duplicate and edit Scenario.',
            details: error.message
        });
    }
})

// Delete a temporary Scenario that was editted for 1D exploration any other duplicated/edited documents.
app.delete('/simulation/explore-scenario/remove', async (req, res) => {
    try {
        const temporaryScenarioId = req.body.scenarioId;
        const scenarioParameter = req.body.scenarioParameter;
        if (scenarioParameter === 'event-start-year') {
            const parameterEvent = await Event.findById(parameterId);
            await StartYear.findByIdAndDelete(parameterEvent.startYear);
            await Event.findByIdAndDelete(parameterEvent._id);
        }
        Scenario.findByIdAndDelete(temporaryScenarioId);
        // TODO: Get back to this and check scenario parameter to remove any new nested documents potentially created by some of the modes.

        res.json({
            success: true,
            message: `Sucessfully removed duplicated scenario ${temporaryScenarioId}.`,
       })
    }
    catch (error) {
        console.error('Error deleting temporary scenario:' , error);
        res.status(500).json({ error: 'Error deleting temporary scenario.' });
    }
})

// Function to seed default tax data if none exists
async function seedDefaultTaxData() {
  try {
    // Check if tax data already exists
    const existingTaxData = await TaxData.findOne();
    
    if (!existingTaxData) {
      console.log('No tax data found. Creating default tax data...');
      
      const currentYear = new Date().getFullYear();
      
      // Create default tax data for the current year
      const defaultTaxData = new TaxData({
        taxYear: currentYear,
        federal: {
          brackets: [
            { min: 0, max: 10275, rate: 0.10 },
            { min: 10275, max: 41775, rate: 0.12 },
            { min: 41775, max: 89075, rate: 0.22 },
            { min: 89075, max: 170050, rate: 0.24 },
            { min: 170050, max: 215950, rate: 0.32 },
            { min: 215950, max: 539900, rate: 0.35 },
            { min: 539900, max: Number.MAX_VALUE, rate: 0.37 }
          ],
          standardDeductions: {
            single: 12950,
            married: 25900
          },
          capitalGains: {
            thresholds: [40400, 445850],
            rates: [0, 0.15, 0.20]
          },
          socialSecurity: [
            { min: 0, max: 25000, taxablePercentage: 0 },
            { min: 25000, max: 34000, taxablePercentage: 0.5 },
            { min: 34000, max: Number.MAX_VALUE, taxablePercentage: 0.85 }
          ]
        },
        state: new Map([
          ["NY", {
            brackets: [
              { min: 0, max: 8500, rate: 0.04 },
              { min: 8500, max: 11700, rate: 0.045 },
              { min: 11700, max: 13900, rate: 0.0525 },
              { min: 13900, max: 80650, rate: 0.055 },
              { min: 80650, max: 215400, rate: 0.0633 },
              { min: 215400, max: 1077550, rate: 0.0685 },
              { min: 1077550, max: Number.MAX_VALUE, rate: 0.0882 }
            ],
            standardDeduction: 8000
          }],
          ["CA", {
            brackets: [
              { min: 0, max: 9325, rate: 0.01 },
              { min: 9325, max: 22107, rate: 0.02 },
              { min: 22107, max: 34892, rate: 0.04 },
              { min: 34892, max: 48435, rate: 0.06 },
              { min: 48435, max: 61214, rate: 0.08 },
              { min: 61214, max: 312686, rate: 0.093 },
              { min: 312686, max: 375221, rate: 0.103 },
              { min: 375221, max: 625369, rate: 0.113 },
              { min: 625369, max: Number.MAX_VALUE, rate: 0.123 }
            ],
            standardDeduction: 4803
          }],
          ["TX", {
            brackets: [
              { min: 0, max: Number.MAX_VALUE, rate: 0 }
            ],
            standardDeduction: 0
          }]
        ]),
        rmdTable: [
          { 72: 25.6, 73: 24.7, 74: 23.8, 75: 22.9, 76: 22.0, 77: 21.2, 78: 20.3, 79: 19.5, 80: 18.7 },
          { 81: 17.9, 82: 17.1, 83: 16.3, 84: 15.5, 85: 14.8, 86: 14.1, 87: 13.4, 88: 12.7, 89: 12.0, 90: 11.4 },
          { 91: 10.8, 92: 10.2, 93: 9.6, 94: 9.1, 95: 8.6, 96: 8.1, 97: 7.6, 98: 7.1, 99: 6.7, 100: 6.3 }
        ]
      });
      
      await defaultTaxData.save();
      console.log('Default tax data created successfully!');
    } else {
      console.log('Tax data already exists, no need to seed.');
    }
  } catch (error) {
    console.error('Error seeding default tax data:', error);
  }
}

// Serve the YAML file from the server
app.get('/download-state-tax-yaml', (req, res) => {
    
    const filePath = path.join(__dirname, 'src', 'YAMLFormat.YAML');
    res.download(filePath, 'YAMLFormat.YAML', (err) => {
      if (err) {
        console.error('Error sending file:', err);
        res.status(500).send('File download failed');
      }
    });
});


// Uploading files
// Create the destination folder if it doesn't exist
const storageDir = path.join(__dirname, 'src', 'StateTaxes');

// Multer storage config
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, storageDir);
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage });


app.post('/upload-state-tax-yaml', upload.single('file'), async (req, res) => {
    let filePath;
    
    try {
        // 1. Validate request
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        if (!req.body.userId) {
            return res.status(400).json({ success: false, message: 'User ID required' });
        }

        filePath = path.join(storageDir, req.file.originalname);

        // 2. Read and parse YAML
        const fileContents = fs.readFileSync(filePath, 'utf8');
        const yamlData = yaml.load(fileContents);
        
        // 3. Extract state code and validate structure
        const stateEntries = Object.entries(yamlData);
        if (stateEntries.length !== 1) {
            throw new Error('YAML must contain exactly one state definition');
        }

        const [stateCode, stateData] = stateEntries[0];
        if (!stateData.brackets || !stateData.brackets.single || !stateData.brackets.married) {
            throw new Error('Invalid YAML structure - missing brackets data');
        }

        // 4. Convert YAML to schema format
        const taxData = {
            stateCode: stateCode.toUpperCase(),
            brackets: {
                single: convertBrackets(stateData.brackets.single),
                married: convertBrackets(stateData.brackets.married)
            }
        };

        // 5. Validate against schema
        const taxDoc = new UserStateTax(taxData);
        await taxDoc.validate(); // Triggers Mongoose validation

        // 6. Check for existing state tax
        const existingTax = await UserStateTax.findOne({ stateCode: taxData.stateCode });
        if (existingTax) {
            await UserStateTax.findByIdAndUpdate(existingTax._id, taxData);
        } else {
            await taxDoc.save();
        }

        // 7. Update user's tax references
        const updatedUser = await User.findByIdAndUpdate(
            req.body.userId,
            { $addToSet: { stateTaxes: existingTax ? existingTax._id : taxDoc._id } },
            { new: true }
        );

        if (!updatedUser) {
            throw new Error('User not found');
        }

        // 8. Cleanup
        fs.unlinkSync(filePath);

        return res.status(200).json({
            success: true,
            message: 'Tax data processed successfully',
            stateCode: taxData.stateCode,
            action: existingTax ? 'updated' : 'created'
        });

    } catch (error) {
        console.error('Upload error:', error);
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        return res.status(500).json({
            success: false,
            message: 'Error processing tax data',
            error: error.message
        });
    }
});

// Convert YAML brackets to schema format
function convertBrackets(yamlBrackets) {
    return yamlBrackets.map(bracket => ({
        rate: Number(bracket.rate),
        min: Number(bracket.min),
        max: bracket.max === null ? null : Number(bracket.max)
    }));
}


//graphs 
//we plan to make the graph data as this follwing format from the actual simulation
app.get('/success-probability', (req, res) => {
    const data = [
      { year: 2026, probability_of_success: 60 },
      { year: 2027, probability_of_success: 62 },
      { year: 2028, probability_of_success: 64 },
      { year: 2029, probability_of_success: 66 },
      { year: 2030, probability_of_success: 68 },
      { year: 2031, probability_of_success: 70 },
      { year: 2032, probability_of_success: 72 },
      { year: 2033, probability_of_success: 74 },
      { year: 2034, probability_of_success: 76 },
      { year: 2035, probability_of_success: 78 },
      { year: 2036, probability_of_success: 80 },
      { year: 2037, probability_of_success: 82 },
      { year: 2038, probability_of_success: 84 },
      { year: 2039, probability_of_success: 86 },
      { year: 2040, probability_of_success: 88 },
      { year: 2041, probability_of_success: 90 },
      { year: 2042, probability_of_success: 91 },
      { year: 2043, probability_of_success: 92 },
      { year: 2044, probability_of_success: 93 },
      { year: 2045, probability_of_success: 94 },
      { year: 2046, probability_of_success: 95 },
      { year: 2047, probability_of_success: 96 },
      { year: 2048, probability_of_success: 97 },
      { year: 2049, probability_of_success: 98 },
      { year: 2050, probability_of_success: 99 },
      { year: 2051, probability_of_success: 99 },
      { year: 2052, probability_of_success: 99 },
      { year: 2053, probability_of_success: 99 },
      { year: 2054, probability_of_success: 99 },
      { year: 2055, probability_of_success: 99 },
      { year: 2056, probability_of_success: 99 },
      { year: 2057, probability_of_success: 99 },
      { year: 2058, probability_of_success: 99 },
      { year: 2059, probability_of_success: 99 },
      { year: 2060, probability_of_success: 100 },
    ];
  
    res.json(data);
});
  
const totalInvestments = [
    { year: 2026, p10: 10000, p20: 10500, p30: 11000, p40: 11500, median: 12000, p60: 12500, p70: 13000, p80: 13500, p90: 14000 },
    { year: 2027, p10: 10500, p20: 11000, p30: 11500, p40: 12000, median: 12500, p60: 13000, p70: 13500, p80: 14000, p90: 14500 },
    { year: 2028, p10: 11000, p20: 11500, p30: 12000, p40: 12500, median: 13000, p60: 13500, p70: 14000, p80: 14500, p90: 15000 },
    { year: 2029, p10: 11500, p20: 12000, p30: 12500, p40: 13000, median: 13500, p60: 14000, p70: 14500, p80: 15000, p90: 15500 },
    { year: 2030, p10: 12000, p20: 12500, p30: 13000, p40: 13500, median: 14000, p60: 14500, p70: 15000, p80: 15500, p90: 16000 },
    { year: 2031, p10: 12500, p20: 13000, p30: 13500, p40: 14000, median: 14500, p60: 15000, p70: 15500, p80: 16000, p90: 16500 },
    { year: 2032, p10: 13000, p20: 13500, p30: 14000, p40: 14500, median: 15000, p60: 15500, p70: 16000, p80: 16500, p90: 17000 },
    { year: 2033, p10: 13500, p20: 14000, p30: 14500, p40: 15000, median: 15500, p60: 16000, p70: 16500, p80: 17000, p90: 17500 },
    { year: 2034, p10: 14000, p20: 14500, p30: 15000, p40: 15500, median: 16000, p60: 16500, p70: 17000, p80: 17500, p90: 18000 },
    { year: 2035, p10: 14500, p20: 15000, p30: 15500, p40: 16000, median: 16500, p60: 17000, p70: 17500, p80: 18000, p90: 18500 },
    { year: 2036, p10: 15000, p20: 15500, p30: 16000, p40: 16500, median: 17000, p60: 17500, p70: 18000, p80: 18500, p90: 19000 },
    { year: 2037, p10: 15500, p20: 16000, p30: 16500, p40: 17000, median: 17500, p60: 18000, p70: 18500, p80: 19000, p90: 19500 },
    { year: 2038, p10: 16000, p20: 16500, p30: 17000, p40: 17500, median: 18000, p60: 18500, p70: 19000, p80: 19500, p90: 20000 },
    { year: 2039, p10: 16500, p20: 17000, p30: 17500, p40: 18000, median: 18500, p60: 19000, p70: 19500, p80: 20000, p90: 20500 },
    { year: 2040, p10: 17000, p20: 17500, p30: 18000, p40: 18500, median: 19000, p60: 19500, p70: 20000, p80: 20500, p90: 21000 },
]  

const totalIncomeData = [
    { year: 2026, p10: 20000, p20: 21000, p30: 22000, p40: 23000, median: 24000, p60: 25000, p70: 26000, p80: 27000, p90: 28000 },
    { year: 2027, p10: 21000, p20: 22000, p30: 23000, p40: 24000, median: 25000, p60: 26000, p70: 27000, p80: 28000, p90: 29000 },
    { year: 2028, p10: 22000, p20: 23000, p30: 24000, p40: 25000, median: 26000, p60: 27000, p70: 28000, p80: 29000, p90: 30000 },
    { year: 2029, p10: 23000, p20: 24000, p30: 25000, p40: 26000, median: 27000, p60: 28000, p70: 29000, p80: 30000, p90: 31000 },
    { year: 2030, p10: 24000, p20: 25000, p30: 26000, p40: 27000, median: 28000, p60: 29000, p70: 30000, p80: 31000, p90: 32000 },
    { year: 2031, p10: 25000, p20: 26000, p30: 27000, p40: 28000, median: 29000, p60: 30000, p70: 31000, p80: 32000, p90: 33000 },
    { year: 2032, p10: 26000, p20: 27000, p30: 28000, p40: 29000, median: 30000, p60: 31000, p70: 32000, p80: 33000, p90: 34000 },
    { year: 2033, p10: 27000, p20: 28000, p30: 29000, p40: 30000, median: 31000, p60: 32000, p70: 33000, p80: 34000, p90: 35000 },
    { year: 2034, p10: 28000, p20: 29000, p30: 30000, p40: 31000, median: 32000, p60: 33000, p70: 34000, p80: 35000, p90: 36000 },
    { year: 2035, p10: 29000, p20: 30000, p30: 31000, p40: 32000, median: 33000, p60: 34000, p70: 35000, p80: 36000, p90: 37000 },
    { year: 2036, p10: 30000, p20: 31000, p30: 32000, p40: 33000, median: 34000, p60: 35000, p70: 36000, p80: 37000, p90: 38000 },
    { year: 2037, p10: 31000, p20: 32000, p30: 33000, p40: 34000, median: 35000, p60: 36000, p70: 37000, p80: 38000, p90: 39000 },
    { year: 2038, p10: 32000, p20: 33000, p30: 34000, p40: 35000, median: 36000, p60: 37000, p70: 38000, p80: 39000, p90: 40000 },
    { year: 2039, p10: 33000, p20: 34000, p30: 35000, p40: 36000, median: 37000, p60: 38000, p70: 39000, p80: 40000, p90: 41000 },
    { year: 2040, p10: 34000, p20: 35000, p30: 36000, p40: 37000, median: 38000, p60: 39000, p70: 40000, p80: 41000, p90: 42000 },
];
  
const totalExpensesData = [
    { year: 2026, p10: 8000, p20: 8500, p30: 9000, p40: 9500, median: 10000, p60: 10500, p70: 11000, p80: 11500, p90: 12000 },
    { year: 2027, p10: 8500, p20: 9000, p30: 9500, p40: 10000, median: 10500, p60: 11000, p70: 11500, p80: 12000, p90: 12500 },
    { year: 2028, p10: 9000, p20: 9500, p30: 10000, p40: 10500, median: 11000, p60: 11500, p70: 12000, p80: 12500, p90: 13000 },
    { year: 2029, p10: 9500, p20: 10000, p30: 10500, p40: 11000, median: 11500, p60: 12000, p70: 12500, p80: 13000, p90: 13500 },
    { year: 2030, p10: 10000, p20: 10500, p30: 11000, p40: 11500, median: 12000, p60: 12500, p70: 13000, p80: 13500, p90: 14000 },
    { year: 2031, p10: 10500, p20: 11000, p30: 11500, p40: 12000, median: 12500, p60: 13000, p70: 13500, p80: 14000, p90: 14500 },
    { year: 2032, p10: 11000, p20: 11500, p30: 12000, p40: 12500, median: 13000, p60: 13500, p70: 14000, p80: 14500, p90: 15000 },
    { year: 2033, p10: 11500, p20: 12000, p30: 12500, p40: 13000, median: 13500, p60: 14000, p70: 14500, p80: 15000, p90: 15500 },
    { year: 2034, p10: 12000, p20: 12500, p30: 13000, p40: 13500, median: 14000, p60: 14500, p70: 15000, p80: 15500, p90: 16000 },
    { year: 2035, p10: 12500, p20: 13000, p30: 13500, p40: 14000, median: 14500, p60: 15000, p70: 15500, p80: 16000, p90: 16500 },
    { year: 2036, p10: 13000, p20: 13500, p30: 14000, p40: 14500, median: 15000, p60: 15500, p70: 16000, p80: 16500, p90: 17000 },
    { year: 2037, p10: 13500, p20: 14000, p30: 14500, p40: 15000, median: 15500, p60: 16000, p70: 16500, p80: 17000, p90: 17500 },
    { year: 2038, p10: 14000, p20: 14500, p30: 15000, p40: 15500, median: 16000, p60: 16500, p70: 17000, p80: 17500, p90: 18000 },
    { year: 2039, p10: 14500, p20: 15000, p30: 15500, p40: 16000, median: 16500, p60: 17000, p70: 17500, p80: 18000, p90: 18500 },
    { year: 2040, p10: 15000, p20: 15500, p30: 16000, p40: 16500, median: 17000, p60: 17500, p70: 18000, p80: 18500, p90: 19000 },
];

const earlyWithdrawalTaxData = [
    { year: 2026, p10: 0, p20: 0, p30: 0, p40: 0, median: 0, p60: 0, p70: 0, p80: 0, p90: 0 },
    { year: 2027, p10: 0, p20: 0, p30: 0, p40: 0, median: 0, p60: 0, p70: 0, p80: 0, p90: 0 },
    { year: 2028, p10: 0, p20: 0, p30: 0, p40: 0, median: 0, p60: 0, p70: 0, p80: 0, p90: 0 },
    { year: 2029, p10: 0, p20: 0, p30: 0, p40: 0, median: 0, p60: 0, p70: 0, p80: 0, p90: 0 },
    { year: 2030, p10: 0, p20: 0, p30: 0, p40: 0, median: 0, p60: 0, p70: 0, p80: 0, p90: 0 },
    { year: 2031, p10: 0, p20: 0, p30: 0, p40: 0, median: 0, p60: 0, p70: 0, p80: 0, p90: 0 },
    { year: 2032, p10: 0, p20: 0, p30: 0, p40: 0, median: 0, p60: 0, p70: 0, p80: 0, p90: 0 },
    { year: 2033, p10: 0, p20: 0, p30: 0, p40: 0, median: 0, p60: 0, p70: 0, p80: 0, p90: 0 },
    { year: 2034, p10: 0, p20: 0, p30: 0, p40: 0, median: 0, p60: 0, p70: 0, p80: 0, p90: 0 },
    { year: 2035, p10: 0, p20: 0, p30: 0, p40: 0, median: 0, p60: 0, p70: 0, p80: 0, p90: 0 },
    { year: 2036, p10: 1000, p20: 1100, p30: 1200, p40: 1300, median: 1400, p60: 1500, p70: 1600, p80: 1700, p90: 1800 },
    { year: 2037, p10: 1100, p20: 1200, p30: 1300, p40: 1400, median: 1500, p60: 1600, p70: 1700, p80: 1800, p90: 1900 },
    { year: 2038, p10: 1200, p20: 1300, p30: 1400, p40: 1500, median: 1600, p60: 1700, p70: 1800, p80: 1900, p90: 2000 },
    { year: 2039, p10: 1300, p20: 1400, p30: 1500, p40: 1600, median: 1700, p60: 1800, p70: 1900, p80: 2000, p90: 2100 },
    { year: 2040, p10: 1400, p20: 1500, p30: 1600, p40: 1700, median: 1800, p60: 1900, p70: 2000, p80: 2100, p90: 2200 },
];

const discretionaryExpensesData = [
    { year: 2026, p10: 5, p20: 7, p30: 10, p40: 13, median: 16, p60: 19, p70: 22, p80: 25, p90: 28 },
    { year: 2027, p10: 6, p20: 8, p30: 11, p40: 14, median: 17, p60: 20, p70: 23, p80: 26, p90: 29 },
    { year: 2028, p10: 7, p20: 9, p30: 12, p40: 15, median: 18, p60: 21, p70: 24, p80: 27, p90: 30 },
    { year: 2029, p10: 8, p20: 10, p30: 13, p40: 16, median: 19, p60: 22, p70: 25, p80: 28, p90: 31 },
    { year: 2030, p10: 9, p20: 11, p30: 14, p40: 17, median: 20, p60: 23, p70: 26, p80: 29, p90: 32 },
    { year: 2031, p10: 10, p20: 12, p30: 15, p40: 18, median: 21, p60: 24, p70: 27, p80: 30, p90: 33 },
    { year: 2032, p10: 11, p20: 13, p30: 16, p40: 19, median: 22, p60: 25, p70: 28, p80: 31, p90: 34 },
    { year: 2033, p10: 12, p20: 14, p30: 17, p40: 20, median: 23, p60: 26, p70: 29, p80: 32, p90: 35 },
    { year: 2034, p10: 13, p20: 15, p30: 18, p40: 21, median: 24, p60: 27, p70: 30, p80: 33, p90: 36 },
    { year: 2035, p10: 14, p20: 16, p30: 19, p40: 22, median: 25, p60: 28, p70: 31, p80: 34, p90: 37 },
    { year: 2036, p10: 15, p20: 17, p30: 20, p40: 23, median: 26, p60: 29, p70: 32, p80: 35, p90: 38 },
    { year: 2037, p10: 16, p20: 18, p30: 21, p40: 24, median: 27, p60: 30, p70: 33, p80: 36, p90: 39 },
    { year: 2038, p10: 17, p20: 19, p30: 22, p40: 25, median: 28, p60: 31, p70: 34, p80: 37, p90: 40 },
    { year: 2039, p10: 18, p20: 20, p30: 23, p40: 26, median: 29, p60: 32, p70: 35, p80: 38, p90: 41 },
    { year: 2040, p10: 19, p20: 21, p30: 24, p40: 27, median: 30, p60: 33, p70: 36, p80: 39, p90: 42 }
];
  
const financialGoalForGraph = 18000;

app.get('/total-investments', (req, res) => {
    res.json(totalInvestments);
  });
  
app.get('/total-income', (req, res) => {
    res.json(totalIncomeData);
});

app.get('/total-expenses', (req, res) => {
    res.json(totalExpensesData);
});

app.get('/early-withdrawal-tax', (req, res) => {
    res.json(earlyWithdrawalTaxData);
});

app.get('/discretionary-expense', (req, res) => {
    res.json(discretionaryExpensesData);
});

app.get('/financial-goal', (req, res) => {
    res.json({ financial_goal: financialGoalForGraph });
});


const avgInvest = [
    { year: 2025, invest_1: 5000, invest_2: 7000, invest_3: 6000, invest_4: 5500 },
    { year: 2026, invest_1: 5200, invest_2: 7100, invest_3: 6150, invest_4: 5600 },
    { year: 2027, invest_1: 5300, invest_2: 7250, invest_3: 6250, invest_4: 5700 },
    { year: 2028, invest_1: 5450, invest_2: 7350, invest_3: 6350, invest_4: 5800 },
    { year: 2029, invest_1: 5600, invest_2: 7500, invest_3: 6450, invest_4: 5900 },
    { year: 2030, invest_1: 5700, invest_2: 7650, invest_3: 6550, invest_4: 6000 },
    { year: 2031, invest_1: 5850, invest_2: 7750, invest_3: 6700, invest_4: 6150 },
    { year: 2032, invest_1: 5950, invest_2: 7900, invest_3: 6800, invest_4: 6250 },
    { year: 2033, invest_1: 6100, invest_2: 8000, invest_3: 6900, invest_4: 6350 },
    { year: 2034, invest_1: 6200, invest_2: 8150, invest_3: 7050, invest_4: 6450 }
];
  

const medianInvestment = [
    { year: 2025, invest_1: 4800, invest_2: 6800, invest_3: 5900, invest_4: 5300 },
    { year: 2026, invest_1: 5000, invest_2: 6950, invest_3: 6000, invest_4: 5450 },
    { year: 2027, invest_1: 5100, invest_2: 7100, invest_3: 6100, invest_4: 5550 },
    { year: 2028, invest_1: 5250, invest_2: 7250, invest_3: 6200, invest_4: 5650 },
    { year: 2029, invest_1: 5400, invest_2: 7350, invest_3: 6300, invest_4: 5750 },
    { year: 2030, invest_1: 5500, invest_2: 7500, invest_3: 6400, invest_4: 5850 },
    { year: 2031, invest_1: 5650, invest_2: 7650, invest_3: 6550, invest_4: 6000 },
    { year: 2032, invest_1: 5750, invest_2: 7800, invest_3: 6650, invest_4: 6100 },
    { year: 2033, invest_1: 5900, invest_2: 7900, invest_3: 6750, invest_4: 6200 },
    { year: 2034, invest_1: 6000, invest_2: 8050, invest_3: 6900, invest_4: 6300 }
];
  

const avgIncome = [
    { year: 2025, income_1: 15000, income_2: 12000, income_3: 13000, income_4: 11000 },
    { year: 2026, income_1: 15500, income_2: 12250, income_3: 13500, income_4: 11200 },
    { year: 2027, income_1: 16000, income_2: 12500, income_3: 14000, income_4: 11400 },
    { year: 2028, income_1: 16500, income_2: 12800, income_3: 14500, income_4: 11700 },
    { year: 2029, income_1: 17000, income_2: 13000, income_3: 15000, income_4: 12000 },
    { year: 2030, income_1: 17500, income_2: 13300, income_3: 15500, income_4: 12250 },
    { year: 2031, income_1: 18000, income_2: 13600, income_3: 16000, income_4: 12500 },
    { year: 2032, income_1: 18500, income_2: 13900, income_3: 16500, income_4: 12750 },
    { year: 2033, income_1: 19000, income_2: 14200, income_3: 17000, income_4: 13000 },
    { year: 2034, income_1: 19500, income_2: 14500, income_3: 17500, income_4: 13250 },
];

const medianIncome = [
    { year: 2025, income_1: 14500, income_2: 11500, income_3: 12500, income_4: 10500 },
    { year: 2026, income_1: 15000, income_2: 11800, income_3: 13000, income_4: 10750 },
    { year: 2027, income_1: 15500, income_2: 12000, income_3: 13500, income_4: 11000 },
    { year: 2028, income_1: 16000, income_2: 12300, income_3: 14000, income_4: 11250 },
    { year: 2029, income_1: 16500, income_2: 12500, income_3: 14500, income_4: 11500 },
    { year: 2030, income_1: 17000, income_2: 12800, income_3: 15000, income_4: 11800 },
    { year: 2031, income_1: 17500, income_2: 13000, income_3: 15500, income_4: 12000 },
    { year: 2032, income_1: 18000, income_2: 13300, income_3: 16000, income_4: 12250 },
    { year: 2033, income_1: 18500, income_2: 13600, income_3: 16500, income_4: 12500 },
    { year: 2034, income_1: 19000, income_2: 13800, income_3: 17000, income_4: 12750 },
];

const avgExpense = [
    { year: 2025, expense_1: 7000, expense_2: 6000, expense_3: 6500, tax: 4000 },
    { year: 2026, expense_1: 7200, expense_2: 6100, expense_3: 6600, tax: 4100 },
    { year: 2027, expense_1: 7350, expense_2: 6250, expense_3: 6750, tax: 4200 },
    { year: 2028, expense_1: 7500, expense_2: 6400, expense_3: 6900, tax: 4300 },
    { year: 2029, expense_1: 7650, expense_2: 6550, expense_3: 7050, tax: 4400 },
    { year: 2030, expense_1: 7800, expense_2: 6700, expense_3: 7200, tax: 4500 },
    { year: 2031, expense_1: 7950, expense_2: 6850, expense_3: 7350, tax: 4600 },
    { year: 2032, expense_1: 8100, expense_2: 7000, expense_3: 7500, tax: 4700 },
    { year: 2033, expense_1: 8250, expense_2: 7150, expense_3: 7650, tax: 4800 },
    { year: 2034, expense_1: 8400, expense_2: 7300, expense_3: 7800, tax: 4900 },
];

const medianExpense = [
    { year: 2025, expense_1: 6800, expense_2: 5800, expense_3: 6300, tax: 3900 },
    { year: 2026, expense_1: 7000, expense_2: 5900, expense_3: 6400, tax: 4000 },
    { year: 2027, expense_1: 7150, expense_2: 6050, expense_3: 6550, tax: 4100 },
    { year: 2028, expense_1: 7300, expense_2: 6200, expense_3: 6700, tax: 4200 },
    { year: 2029, expense_1: 7450, expense_2: 6350, expense_3: 6850, tax: 4300 },
    { year: 2030, expense_1: 7600, expense_2: 6500, expense_3: 7000, tax: 4400 },
    { year: 2031, expense_1: 7750, expense_2: 6650, expense_3: 7150, tax: 4500 },
    { year: 2032, expense_1: 7900, expense_2: 6800, expense_3: 7300, tax: 4600 },
    { year: 2033, expense_1: 8050, expense_2: 6950, expense_3: 7450, tax: 4700 },
    { year: 2034, expense_1: 8200, expense_2: 7100, expense_3: 7600, tax: 4800 },
];
  
  
  
  
app.get('/avg-investment', (req, res) => {
    res.json(avgInvest);
});

app.get('/median-investment', (req, res) => {
    res.json(medianInvestment);
});

app.get('/avg-expenses', (req, res) => {
    res.json(avgExpense);
});

app.get('/median-expenses', (req, res) => {
    res.json(medianExpense);
});

app.get('/avg-income', (req, res) => {
    res.json(avgIncome);
});

app.get('/median-income', (req, res) => {
    res.json(medianIncome);
});
