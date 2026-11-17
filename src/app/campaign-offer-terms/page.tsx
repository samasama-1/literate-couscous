import type {Metadata} from 'next';
import Link from 'next/link';
import PolicyPage from '@/components/PolicyPage';
import {campaignOfferTerms} from '@/lib/discounts/offer-terms';

export const metadata:Metadata={
 title:'Campaign thank-you offer terms',
 description:campaignOfferTerms.description,
 alternates:{canonical:'/campaign-offer-terms'},
 openGraph:{title:'SamaSama campaign thank-you offer',description:campaignOfferTerms.description,url:'/campaign-offer-terms'},
};

export default function Page(){
 return <><PolicyPage policy={campaignOfferTerms}/><nav aria-label="Related policies" className="container-site" style={{paddingBottom:'3rem',display:'flex',gap:'1.5rem',flexWrap:'wrap'}}><Link href="/terms">General terms</Link><Link href="/refunds-and-replacements">Refunds and replacements</Link><Link href="/privacy">Privacy Policy</Link><a href="mailto:hello@samasama.sg">Ask us about your code</a></nav></>;
}
