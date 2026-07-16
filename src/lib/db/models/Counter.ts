import mongoose, { Schema } from 'mongoose';

// Counter model for auto-incrementing sequence numbers
interface ICounter {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<ICounter>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});

// Static method to get next sequence number
counterSchema.statics.getNextSequence = async function(sequenceName: string): Promise<number> {
  const counter = await this.findByIdAndUpdate(
    sequenceName,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
};

const Counter = mongoose.models.Counter || mongoose.model<ICounter>('Counter', counterSchema);

export default Counter;
