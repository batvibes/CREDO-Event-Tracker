-- Event Type Templates: objectives and description on event_types

alter table public.event_types
  add column if not exists objectives text not null default '',
  add column if not exists description text not null default '';

update public.event_types
set
  objectives = 'To assist married couples in developing and strengthening healthy communication, relationship skills, and marital resilience amidst the military demands.',
  description = 'The emphasis of this 3-day blended MER is to strengthen the marriages of service members. The MER employs a combination of instruction, group and private discussions, and exercises designed to strengthen relationships, identify growth areas, and build resiliency in an inviting environment, free from the distractions of every-day life.'
where name = 'Marriage Enrichment Retreat';

update public.event_types
set
  objectives = 'To assist married couples and/or spouses, using six (6) 30 minute virtual classes, develop and/or strengthening healthy communication, relationship skills, and marital resilience amidst the demanding environment of military service.',
  description = 'The emphasis of this workshop is to strengthen the marriages of service members using a combination of instruction, private discussions, and exercises designed to enhance relationships, especially in the areas of communication, identify growth areas, and build resiliency in an inviting environment, free from the distractions of every-day life.'
where name = 'Dinner Date Night';

update public.event_types
set
  objectives = 'To assist married couples and/or spouses during one-day workshop in developing and strengthening healthy communication, relationship skills, and marital resilience amidst the military demands, by offering training to local Chaplains to Facilitate the training in their commands.',
  description = 'The emphasis of this one-day marriage workshop is to strengthen the marriages of service members. The workshop employs a combination of instruction, group and private discussions, and exercises designed to enhance relationships, especially in the area of communication, identify growth areas, and build resiliency in an inviting environment, free from the distractions of every-day life.'
where name = 'Marriage Enrichment Workshop';

update public.event_types
set
  objectives = 'To assist families in developing and strengthening healthy communication, family bonding, and relationship skills amidst the military demands.',
  description = 'The emphasis of this 3-day blended FER is to strengthen the families of service members. The FER employs family activities, in partnership with L.I.N.K.S., to strengthen relationships, identify growth areas, and build resiliency in an inviting environment, free from the distractions of every-day life.'
where name = 'Family Enrichment Retreat';

update public.event_types
set
  objectives = 'To assist warriors, identify and develop their unique personal talents and give them a pathway to strengthen them. Assist leaders to develop people and teams in their area of influence.',
  description = 'The emphasis of this 4-hour blended Workshop employs a combination of instruction, with exercises designed to build self-awareness, identify unique strength combination areas, and build competence in an inviting environment.'
where name in ('Personal Growth Workshop', 'Personal Growth Retreat');

update public.event_types
set
  objectives = 'To train service members on suicide intervention skills using ASIST by LivingWorks.',
  description = 'LivingWorks ASIST workshop is a 16-hour face-to-face workshop featuring powerful audiovisuals, discussions, and simulations, equipping service members in preventing suicide by recognizing signs, engaging someone, and learning the skills to provide an intervention as well as connecting to resources for further support.'
where name = 'ASIST Workshop';

update public.event_types
set
  objectives = 'To train service members on suicide prevention skills using safeTALK by LivingWorks.',
  description = 'LivingWorks safeTALK workshop is a four-hour face-to-face workshop featuring powerful audiovisuals, discussions, and simulations, equipping service members in preventing suicide by recognizing signs, engaging someone, and connecting them to an intervention resource for further support.'
where name = 'SafeTalk Workshop';

update public.event_types
set
  objectives = 'To train service members on suicide prevention skills using safeTALK T4T by LivingWorks.',
  description = 'LivingWorks safeTALK T4T workshop is a 16-hour face-to-face workshop featuring powerful audiovisuals, discussions, and simulations, equipping service members in preventing suicide by recognizing signs, engaging someone, and connecting them to an intervention resource for further support.'
where name = 'SafeTalk T4T';

update public.event_types
set
  objectives = 'To train service members on suicide prevention skills using ASIST T4T by LivingWorks.',
  description = 'LivingWorks ASIST T4T workshop is a 16-hour face-to-face workshop featuring powerful audiovisuals, discussions, and simulations, equipping service members in preventing suicide by recognizing signs, engaging someone, and connecting them to an intervention resource for further support.'
where name = 'ASIST T4T';

update public.event_types
set
  objectives = 'To prepare service members for positions of increased responsibility by developing core leadership competencies. Enhance the ability to lead with integrity, communicate vision, and build cohesive teams capable of executing mission requirements.',
  description = 'This comprehensive course combines theoretical frameworks with practical application through scenario-based exercises. Participants will examine leadership principles, ethical decision-making, and strategies for motivating personnel in challenging environments to foster mission-ready leaders.'
where name = 'Leadership Development';
