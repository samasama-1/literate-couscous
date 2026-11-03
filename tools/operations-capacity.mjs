// No credentials/network. Outputs reproducible planning scenarios only.
import {capacityModel,planningWorkload} from '../src/lib/operations/capacity.ts';
const scenarios=[100,500,1000,2000].map(n=>capacityModel(n));
console.log(JSON.stringify({assumptions:planningWorkload,scenarios},null,2));
