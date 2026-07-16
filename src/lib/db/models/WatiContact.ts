import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IWatiCustomParam {
  name: string;
  value: string;
}

export interface IWatiContact extends Document {
  wAid?: string;
  allowBroadcast?: boolean;
  allowSMS?: boolean;
  channelId?: string | null;
  channelType?: number;
  contactLink?: string | null;
  contactLinkId?: string | null;
  contactStatus?: string;
  created?: string;
  ctwaFollowUpCount?: number;
  ctwaFollowUpNotice?: number;
  ctwaFollowUpStatus?: number;
  currentFlowNodeId?: string | null;
  customLabel?: string | null;
  customParams?: IWatiCustomParam[];
  deletedFromSMB?: boolean;
  displayId?: string | null;
  displayName?: string | null;
  firstName?: string | null;
  fullName?: string | null;
  externalId?: string; // maps original "id"
  igPhoneSource?: number;
  importedAt?: string | null;
  instagramConversationId?: string | null;
  isDeleted?: boolean;
  isInFlow?: boolean;
  isInTestFlow?: boolean;
  isSendBCLimit?: boolean;
  isShowCTWAFollowUpNotice?: boolean;
  lastFlowId?: string | null;
  lastUpdated?: string | null;
  messengerConversationId?: string | null;
  messengerPageName?: string;
  mgPhoneSource?: number;
  operatorIds?: string[] | null;
  optedIn?: boolean;
  paylinkSettings?: unknown;
  phone?: string;
  photo?: string | null;
  regionCode?: string | null;
  segments?: unknown;
  selectedHubspotId?: string | null;
  source?: string | null;
  tagName?: string | null;
  teamIds?: string[] | null;
  tenantId?: string | null;
  waChannelPhone?: string | null;
  // Derived fields for leaderboard
  level?: number;
  city?: string | null;
}

const customParamSchema = new Schema<IWatiCustomParam>({
  name: { type: String, required: true },
  value: { type: String, required: true }
}, { _id: false });

const watiContactSchema = new Schema<IWatiContact>({
  wAid: { type: String },
  allowBroadcast: { type: Boolean },
  allowSMS: { type: Boolean },
  channelId: { type: String, default: null },
  channelType: { type: Number },
  contactLink: { type: String, default: null },
  contactLinkId: { type: String, default: null },
  contactStatus: { type: String },
  created: { type: String },
  ctwaFollowUpCount: { type: Number, default: 0 },
  ctwaFollowUpNotice: { type: Number, default: 0 },
  ctwaFollowUpStatus: { type: Number, default: 0 },
  currentFlowNodeId: { type: String, default: null },
  customLabel: { type: String, default: null },
  customParams: { type: [customParamSchema], default: [] },
  deletedFromSMB: { type: Boolean, default: false },
  displayId: { type: String, default: null },
  displayName: { type: String, default: null },
  firstName: { type: String, default: null },
  fullName: { type: String, default: null },
  externalId: { type: String },
  igPhoneSource: { type: Number, default: 0 },
  importedAt: { type: String, default: null },
  instagramConversationId: { type: String, default: null },
  isDeleted: { type: Boolean, default: false },
  isInFlow: { type: Boolean, default: false },
  isInTestFlow: { type: Boolean, default: false },
  isSendBCLimit: { type: Boolean, default: false },
  isShowCTWAFollowUpNotice: { type: Boolean, default: false },
  lastFlowId: { type: String, default: null },
  lastUpdated: { type: String, default: null },
  messengerConversationId: { type: String, default: null },
  messengerPageName: { type: String, default: '' },
  mgPhoneSource: { type: Number, default: 0 },
  operatorIds: { type: [String], default: null },
  optedIn: { type: Boolean, default: false },
  paylinkSettings: { type: Schema.Types.Mixed, default: null },
  phone: { type: String },
  photo: { type: String, default: null },
  regionCode: { type: String, default: null },
  segments: { type: Schema.Types.Mixed, default: null },
  selectedHubspotId: { type: String, default: null },
  source: { type: String, default: null },
  tagName: { type: String, default: null },
  teamIds: { type: [String], default: null },
  tenantId: { type: String, default: null },
  waChannelPhone: { type: String, default: null },
  // Derived fields
  level: { type: Number, default: 0 },
  city: { type: String, default: null }
}, {
  timestamps: true
});

// Helpful indexes
watiContactSchema.index({ phone: 1 }, { unique: false });
watiContactSchema.index({ externalId: 1 }, { unique: false });
watiContactSchema.index({ level: -1 });

const WatiContact: Model<IWatiContact> = mongoose.models.WatiContact || mongoose.model<IWatiContact>('WatiContact', watiContactSchema);

export default WatiContact;

