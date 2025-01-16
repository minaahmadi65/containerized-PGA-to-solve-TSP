const geneticAlgorithm = require('./main');
const axios = require('axios');

const args = process.argv.slice(2);
const workerIdArg = args.find(arg => arg.startsWith('--worker-id='));
const workerId = workerIdArg ? workerIdArg.split('=')[1] : 'default';

//console.log(`Worker ID: ${workerId}`); 

const GA = new geneticAlgorithm.TSPGeneticAlgorithm()

const setting = {
    tspFilePath: '', 
    configsGA: {
        populationSize: '',
        generationSize: '',
        tournamentRate : '',
        elitismRate : '',
        crossoverRate :'',
        mutationRate : ''
    }
};


async function getJob() {
    try {
        const response = await axios.get('http://localhost:3000/get-job');
        return response.data; // Return an array of jobs
    } catch (error) {
       // console.error('Failed to get job:', error.message);
        return null;
    }
}


async function sendJobResult(result) {
    try {
        await axios.post('http://localhost:3000/post-result', result);

    } catch (error) {
        console.error('Failed to send job result:', error.message);
    }
}



async function processTasks(jobs) {
    const results = await Promise.all(
        jobs.map(async (job) => {
           // console.log(`Worker ID: ${workerId} is Processing job ==> gen:${job.gen} , id:${job.id}`);

            const [crossPop1, crossPop2] = GA.Crossover(job.solution[0], job.solution[1]);
            const healPop1 = GA.Heal(crossPop1);
            const healPop2 = GA.Heal(crossPop2);
            const mutPop1 = GA.MutationSmart(healPop1);
            const mutPop2 = GA.MutationSmart(healPop2);

            job.solution1 = GA.DeepOptimize(mutPop1);
            job.solution2 = GA.DeepOptimize(mutPop2);

            job.solution1.tspDistance = GA.CalculateRouteDistance(job.solution1.tspRoute);
            job.solution2.tspDistance = GA.CalculateRouteDistance(job.solution2.tspRoute);

            return { gen: job.gen, jobId: job.id, solution: [job.solution1, job.solution2] };
        })
    );
    return results;
}

async function getSettings() {
    while (true) {  
        try {
            const response = await axios.get('http://localhost:3000/get-settings');

            setting.tspFilePath = response.data.tspFilePath;
            setting.configsGA = response.data.configsGA;
            console.log('Updated configs:', setting.configsGA);

            const allCities = GA.ImportTSPFile(setting.tspFilePath);
            console.log(`Worker ID ${workerId} is using TSP file: ${setting.tspFilePath}`);
            return true;
        } catch (error) {
            console.error('Failed to get settings:', error.message);
            await new Promise(resolve => setTimeout(resolve, 10000)); 
        }
    }
}


async function startWorking() {
    let jobFailCounter = 0;
    const settingsLoaded = await getSettings();
    if (!settingsLoaded) {
        console.log('Failed to load settings, stopping worker...');
        return;
    }

    while (true) {
        const jobs = await getJob(); // Retrieve multiple jobs
        if (jobs && jobs.length > 0) {
            jobFailCounter = 0;
            try {
                const results = await processTasks(jobs); // Process each job
                for (const result of results) {
                    await sendJobResult(result); // Send each result back
                }
            } catch (error) {
                console.error('Error processing jobs:', error);
            }
        } else {
            jobFailCounter++;
            if (jobFailCounter >= 100) {
                console.log('Failed to get jobs 10000 consecutive times, reloading settings...');
                await getSettings();
                jobFailCounter = 0;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
}

startWorking();