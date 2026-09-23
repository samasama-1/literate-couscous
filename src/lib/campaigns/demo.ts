import type { Campaign, CampaignProduct } from './types';
const timestamp = '2026-09-22T00:00:00Z';
export const demoCampaign: Campaign = {
  id:'00000000-0000-4000-8000-000000000001',name:'The first home shortlist · test campaign',slug:'home-shortlist-test',
  description:'Two hairdryers. Two air fryers. Help us choose our first drop.',
  headline:'Four shortlisted products. Which one belongs in your home?',
  subheadline:'Meet two hairdryers and two air fryers on our shortlist. Pick your favourite and tell us if you’re interested. Your vote helps us choose what to bring in next. No purchase or payment is required.',
  cta_text:'Register my pick',confirmation_text:'Your test pick is recorded. No purchase, payment or commitment is involved.',
  status:'active',starts_at:null,ends_at:null,reservation_enabled:false,is_test:true,created_at:timestamp,updated_at:timestamp,
};
// Neutral public names. Supplier/model mapping and source evidence stay in docs/campaign-product-sources.md.
const options = [
  {
    name:'Everyday Air',label:'Hairdryer A',price:9900,
    benefit:'A simple handheld design',
    description:'A straight-barrel hairdryer with handle-mounted controls and an air-intake grille at the base.',
    why:'A clean, straightforward design to compare with the folding option.',
    specs:['Handle-mounted controls','Air intake at the base of the handle','White and graphite finishes shown in the supplied images'],
    tradeoff:'Power, motor speed and weight are still to be confirmed.',image:'hairdryer-a.webp',
  },
  {
    name:'Studio Air',label:'Hairdryer B',price:10900,
    benefit:'Folding away between uses',
    description:'A folding hairdryer with a brushless motor, digital display and separate airflow and heat controls. The image shows two views of the same model.',
    why:'A rotating folding handle and adjustable settings offer a different everyday setup.',
    specs:['1,600 W at 220–240 V (supplier specification)','110,000 rpm BLDC motor (supplier specification)','Three speeds and three heat settings','Cool-air function and LED display','Rotating folding handle'],
    tradeoff:'Final colour and included attachments are still to be confirmed.',image:'hairdryer-b.webp',
  },
  {
    name:'Double Stack Steamer/Airfryer',label:'Air fryer A',price:21900,
    benefit:'Steam cooking and air frying in separate compartments',
    description:'A stacked, two-drawer appliance combining an upper steam-cooking zone with a lower air-frying zone.',
    why:'Separate cooking zones arranged vertically, with a viewing window in each drawer.',
    specs:['11 L total capacity: 4.5 L + 6.5 L','Upper zone: steam and steam-assisted roasting','Lower zone: air frying and roasting','600 ml water tank','270 W × 412 D × 446 H mm (supplier specification)'],
    tradeoff:'Check the 446 mm height against your available counter space.',image:'air-fryer-a.webp',
  },
  {
    name:'Single Stack Steamer/Airfryer',label:'Air fryer B',price:20900,
    benefit:'Checking food through the drawer window',
    description:'A black air fryer with a front viewing window, a pull-out drawer and a digital control panel.',
    why:'The viewing window and front-facing controls make this a useful design to compare with the stacked option.',
    specs:['Single front drawer','Viewing window in the drawer','Digital front control panel'],
    tradeoff:'Capacity, power and cooking modes are still to be confirmed.',image:'air-fryer-b.webp',
  },
];
export const demoProducts: CampaignProduct[] = options.map((p,i)=>({
  id:`00000000-0000-4000-8000-00000000000${i+2}`,campaign_id:demoCampaign.id,product_id:null,
  public_name:p.name,public_label:p.label,short_description:p.description,key_benefit:p.benefit,key_differentiator:p.why,
  specifications:p.specs,tradeoff:p.tradeoff,estimated_price_cents:p.price,currency:'SGD',display_order:i+1,
  image_url:`/campaign-products/${p.image}`,active:true,created_at:timestamp,updated_at:timestamp,
}));
