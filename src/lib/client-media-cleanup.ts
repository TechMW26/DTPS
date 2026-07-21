import "server-only";

import ClientMealPlan from "@/lib/db/models/ClientMealPlan";
import { File as FileModel } from "@/lib/db/models/File";
import GroupMessage from "@/lib/db/models/GroupMessage";
import Message from "@/lib/db/models/Message";
import OtherPlatformPayment from "@/lib/db/models/OtherPlatformPayment";
import ProgressEntry from "@/lib/db/models/ProgressEntry";
import {
  deleteImageKitAssets,
  type ImageKitAsset,
} from "@/lib/imagekit-storage";

type ClientMediaOwner = {
  _id: unknown;
  avatar?: string;
  documents?: Array<{ filePath?: string }>;
};

export async function deleteUserAvatarImageKitMedia(
  user: Pick<ClientMediaOwner, "_id" | "avatar">,
): Promise<void> {
  if (!user.avatar) return;
  const file = await FileModel.findOne({
    uploadedBy: user._id,
    type: "avatar",
    imageKitUrl: user.avatar,
  })
    .select("_id imageKitFileId imageKitUrl")
    .lean();
  await deleteImageKitAssets([
    { fileId: (file as any)?.imageKitFileId, url: user.avatar },
  ]);
  if (file) await FileModel.deleteOne({ _id: (file as any)._id });
}

export async function deleteClientImageKitMedia(
  user: ClientMediaOwner,
): Promise<void> {
  const [ownedFiles, messages, progressPhotos, mealPlans, payments] =
    await Promise.all([
      FileModel.find({ uploadedBy: user._id })
        .select("_id imageKitFileId imageKitUrl")
        .lean(),
      Message.find({ $or: [{ sender: user._id }, { receiver: user._id }] })
        .select("attachments")
        .lean(),
      ProgressEntry.find({ user: user._id, type: "photo" })
        .select("value metadata")
        .lean(),
      ClientMealPlan.find({ clientId: user._id })
        .select("mealCompletions progress.photos")
        .lean(),
      OtherPlatformPayment.find({ client: user._id })
        .select("receiptImageFileId receiptImageUrl")
        .lean(),
    ]);

  const attachmentFileIds = messages
    .flatMap((message: any) => message.attachments || [])
    .map((attachment: any) => attachment.fileId)
    .filter(Boolean);
  const documentFileIds = (user.documents || [])
    .map((document) =>
      String(document.filePath || "")
        .split("/")
        .pop(),
    )
    .filter((id): id is string => Boolean(id && /^[a-f\d]{24}$/i.test(id)));
  const referencedFiles = await FileModel.find({
    _id: { $in: [...attachmentFileIds, ...documentFileIds] },
  })
    .select("_id imageKitFileId imageKitUrl")
    .lean();

  const allFiles = [
    ...new Map(
      [...ownedFiles, ...referencedFiles].map((file: any) => [
        String(file._id),
        file,
      ]),
    ).values(),
  ];
  const assets: Array<ImageKitAsset & { databaseFileId?: unknown }> = [
    { url: user.avatar },
    ...allFiles.map((file: any) => ({
      fileId: file.imageKitFileId,
      url: file.imageKitUrl,
      databaseFileId: file._id,
    })),
    ...progressPhotos.map((photo: any) => ({
      fileId: photo.metadata?.imageKitFileId,
      url: typeof photo.value === "string" ? photo.value : undefined,
    })),
    ...mealPlans.flatMap((plan: any) => [
      ...(plan.mealCompletions || []).map((completion: any) => ({
        fileId: completion.imageKitFileId,
        url: completion.imagePath,
      })),
      ...(plan.progress || []).flatMap((entry: any) =>
        (entry.photos || []).map((url: string) => ({ url })),
      ),
    ]),
    ...payments.map((payment: any) => ({
      fileId: payment.receiptImageFileId,
      url: payment.receiptImageUrl,
    })),
  ];

  // Keep shared/forwarded attachments alive. The asset is deleted only when
  // no surviving direct or group message references its DB id or URL.
  const deletableAssets = (
    await Promise.all(
      assets.map(async (asset) => {
        if (!asset.databaseFileId && !asset.url) return asset;
        const attachmentReferences = [
          ...(asset.databaseFileId
            ? [{ "attachments.fileId": asset.databaseFileId }]
            : []),
          ...(asset.url ? [{ "attachments.url": asset.url }] : []),
        ];
        if (!attachmentReferences.length) return asset;

        const [survivingDirectMessage, groupMessage] = await Promise.all([
          Message.exists({
            $and: [
              { $or: attachmentReferences },
              { $nor: [{ sender: user._id }, { receiver: user._id }] },
            ],
          }),
          GroupMessage.exists({ $or: attachmentReferences }),
        ]);
        return survivingDirectMessage || groupMessage ? null : asset;
      }),
    )
  ).filter(Boolean) as Array<ImageKitAsset & { databaseFileId?: unknown }>;

  await deleteImageKitAssets(deletableAssets);
  await FileModel.deleteMany({
    _id: {
      $in: deletableAssets
        .map((asset) => asset.databaseFileId)
        .filter(Boolean),
    },
  });
}
