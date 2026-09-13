export interface ClientFilterValues {
  status: string;
  primaryDietitian: string;
  secondaryDietitian: string;
  tagId: string;
  dtAssignedFrom: string;
  dtAssignedTo: string;
  hcAssignedFrom: string;
  hcAssignedTo: string;
  planName: string;
  planDuration: string; // '' | 'ongoing' | 'dateRange'
  planDurationFrom: string;
  planDurationTo: string;
  planStatus: string;
  planShared: string; // '' | 'yes' | 'no'
  lastActivityHCFrom: string;
  lastActivityHCTo: string;
  lastActivityDTFrom: string;
  lastActivityDTTo: string;
}

export const EMPTY_CLIENT_FILTERS: ClientFilterValues = {
  status: '',
  primaryDietitian: '',
  secondaryDietitian: '',
  tagId: '',
  dtAssignedFrom: '',
  dtAssignedTo: '',
  hcAssignedFrom: '',
  hcAssignedTo: '',
  planName: '',
  planDuration: '',
  planDurationFrom: '',
  planDurationTo: '',
  planStatus: '',
  planShared: '',
  lastActivityHCFrom: '',
  lastActivityHCTo: '',
  lastActivityDTFrom: '',
  lastActivityDTTo: '',
};
