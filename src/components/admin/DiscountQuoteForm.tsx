'use client';
import {useActionState,useState} from 'react';
import {quoteDiscountOrder,type DiscountResult} from '@/app/actions/discounts';
import {money} from './order-presentation';
import styles from './workspace.module.css';
export default function DiscountQuoteForm({id,revision,quantity,method,unit,delivery,discount}:{id:string;revision:number;quantity:number;method:string;unit?:number|null;delivery?:number|null;discount?:number}){
 const[result,action,pending]=useActionState<DiscountResult,FormData>(quoteDiscountOrder,{});
 const[productPrice,setPrice]=useState(unit==null?'':(unit/100).toFixed(2)),[charge,setCharge]=useState(((delivery||0)/100).toFixed(2));
 const estimate=productPrice!==''?Math.round(Number(productPrice)*100)*quantity+(method==='delivery'?Math.round(Number(charge)*100):0)-(discount||0):null;
 return <form action={action} className={styles.operationForm}>
 <input type="hidden" name="id" value={id}/><input type="hidden" name="revision" value={revision}/>
 <h3>Confirm the final price</h3><label>Product price per unit before discount · S$<input name="unit" required type="number" min="0" step="0.01" value={productPrice} onChange={e=>setPrice(e.target.value)}/></label>
 {method==='delivery'?<label>Agreed delivery charge for the whole order · S$<input name="delivery" required type="number" min="0" step="0.01" value={charge} onChange={e=>setCharge(e.target.value)}/></label>:<input name="delivery" type="hidden" value="0"/>}
 <p>{quantity} unit(s) · Campaign discount: {money(discount||0)}{estimate!=null&&Number.isFinite(estimate)?` · Final total: ${money(estimate)}`:''}</p><p>The server validates eligibility and subtracts S$10 per qualifying unit once. Product price must be at least S$50 per unit to use a campaign code. Delivery and storage do not count toward that minimum.</p>
 <button disabled={pending||!!result.success} className={styles.primaryButton}>{pending?'Saving…':'Confirm final total'}</button>
 {result.error&&<p role="alert">{result.error}</p>}{result.success&&<p role="status">{result.success}</p>}
 </form>;
}
