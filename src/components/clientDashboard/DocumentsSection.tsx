"use client";

import { useState, useEffect, ChangeEvent, FormEvent, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Plus, Search, Image as ImageIcon, X, RefreshCw, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getMediaProxyUrl, openMediaInApp } from "@/lib/media";

export interface ClientDocument {
  id: string;
  type: "meal-picture" | "medical-report" | "transformation";
  uploadedAt: string;
  fileName: string;
  filePath: string;
  source?: "manual-upload" | "medical-info" | "meal-completion";
  tag?: string;
  category?: string;
  mealType?: string;
  date?: string;
  notes?: string;
  planName?: string;
}

interface DocumentsSectionProps {
  client: {
    _id: string;
    createdAt: string;
    documents?: ClientDocument[];
  };
  formatDate: (date: string) => string;
  onRegisterReset?: (fn: () => void) => void;
}

export default function DocumentsSection({
  client,
  formatDate,
  onRegisterReset,
}: DocumentsSectionProps) {
  const [documents, setDocuments] = useState<ClientDocument[]>(
    client.documents || []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [documentCounts, setDocumentCounts] = useState({
    total: 0,
    manual: 0,
    medicalReports: 0,
    mealCompletions: 0,
    transformations: 0
  });

  // Fetch all documents including medical reports and meal completion images
  const fetchAllDocuments = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/dietitian-panel/clients/${client._id}/documents`);

      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
        setDocumentCounts(data.counts || {
          total: 0,
          manual: 0,
          medicalReports: 0,
          mealCompletions: 0,
          transformations: 0
        });
      } else {
        // Fallback to client.documents if API fails
        setDocuments(client.documents || []);
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
      setDocuments(client.documents || []);
    } finally {
      setIsLoading(false);
    }
  }, [client._id, client.documents]);

  // Load documents on mount
  useEffect(() => {
    fetchAllDocuments();
  }, [fetchAllDocuments]);

  // Register reset callback for floating back button
  useEffect(() => {
    if (onRegisterReset) {
      onRegisterReset(() => {
        fetchAllDocuments();
      });
    }
  }, [onRegisterReset]);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [docType, setDocType] = useState<
    "meal-picture" | "medical-report" | "transformation" | ""
  >("");
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [filterType, setFilterType] = useState<"all" | "meal-picture" | "medical-report" | "transformation">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Filter and search documents
  const filteredDocuments = documents.filter((doc) => {
    const matchesType = filterType === "all" || doc.type === filterType;
    const matchesSearch = searchQuery === "" ||
      doc.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.tag?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.category?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const isImage = f.type.startsWith("image/");
    const isPdf = f.type === "application/pdf";

    if (!isImage && !isPdf) {
      alert("Only image or PDF files are allowed");
      return;
    }

    setFile(f);
  };

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!docType || !file) {
      alert("Please select document type and file");
      return;
    }

    try {
      setIsUploading(true);

      const formData = new FormData();
      formData.append("type", docType);
      formData.append("file", file);

      const res = await fetch(`/api/users/${client._id}/documents`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");

      // Refresh all documents to include the newly uploaded one
      await fetchAllDocuments();
      setUploadOpen(false);
      setDocType("");
      setFile(null);
    } catch (err) {
      console.error(err);
      alert("Error uploading document");
    } finally {
      setIsUploading(false);
    }
  };

  const shortenFileName = (name: string, maxLength = 25) => {
    if (name.length <= maxLength) return name;
    const ext = name.split(".").pop();
    return name.substring(0, maxLength) + (ext ? `.${ext}` : "...");
  };

  const viewFile = (filePath: string, fileName: string) => {
    openMediaInApp(filePath, fileName);
  };

  const downloadFile = (filePath: string, fileName: string) => {
    const link = document.createElement("a");
    link.href = getMediaProxyUrl(filePath, { download: true, filename: fileName });
    link.download = fileName;
    link.click();
  };

  const hasDocuments = filteredDocuments.length > 0;

  return (
    <div className="mt-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <CardTitle>Client Documents</CardTitle>
              {documentCounts.total > 0 && (
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-xs">
                    {documentCounts.total} Total
                  </Badge>
                  {documentCounts.medicalReports > 0 && (
                    <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                      {documentCounts.medicalReports} Medical
                    </Badge>
                  )}
                  {documentCounts.mealCompletions > 0 && (
                    <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                      {documentCounts.mealCompletions} Meal Photos
                    </Badge>
                  )}
                  {documentCounts.transformations > 0 && (
                    <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                      {documentCounts.transformations} Transformation
                    </Badge>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 w-45"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                  >
                    <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                  </button>
                )}
              </div>

              {/* Single Filter Dropdown */}
              <Select
                value={filterType}
                onValueChange={(val: any) => setFilterType(val)}
              >
                <SelectTrigger className="w-45">
                  <SelectValue placeholder="Filter Documents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Documents</SelectItem>
                  <SelectItem value="medical-report">Medical Reports</SelectItem>
                  <SelectItem value="meal-picture">Meal Pictures</SelectItem>
                  <SelectItem value="transformation">Transformation</SelectItem>
                </SelectContent>
              </Select>

              {/* Refresh Button */}
              <Button
                size="sm"
                variant="outline"
                onClick={fetchAllDocuments}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>

              {/* Upload Button */}
              <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Upload
                  </Button>
                </DialogTrigger>

                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Upload Document</DialogTitle>
                  </DialogHeader>

                  <form onSubmit={handleUpload} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Document type</Label>
                      <Select
                        value={docType}
                        onValueChange={(value) => setDocType(value as any)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="meal-picture">
                            Meal pictures
                          </SelectItem>
                          <SelectItem value="medical-report">
                            Medical report
                          </SelectItem>
                          <SelectItem value="transformation">
                            Transformation
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {docType === "transformation" && (
                        <p className="text-xs text-gray-500">
                          Transformation photos: Before/After images showing client progress
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>File (image or PDF)</Label>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        capture="environment"
                        onChange={handleFileChange}
                      />
                      {file && (
                        <p className="text-xs text-gray-500">
                          Selected: {file.name}
                        </p>
                      )}
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setUploadOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isUploading}>
                        {isUploading ? "Uploading..." : "Upload"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {!hasDocuments && (
            <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded">
              <FileText className="h-10 w-10 mx-auto mb-3 text-gray-400" />
              <p className="text-sm mb-1">No documents found.</p>
              <p className="text-xs text-gray-400">
                Try changing the filter or uploading a document.
              </p>
            </div>
          )}

          {hasDocuments && (
            <div className="mt-4 overflow-x-auto rounded border">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-left">
                    <th className="px-3 py-2">S.No</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Tag</th>
                    <th className="px-3 py-2">File name</th>
                    <th className="px-3 py-2">Uploaded on</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredDocuments.map((doc, index) => (
                    <tr
                      key={doc.id || index}
                      className={cn(
                        "border-t",
                        index % 2 ? "bg-gray-50" : "bg-white"
                      )}
                    >
                      <td className="px-3 py-2">{index + 1}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {doc.type === "meal-picture" ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
                              Meal Picture
                            </Badge>
                          ) : doc.type === "transformation" ? (
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs">
                              Transformation
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                              Medical Report
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {doc.tag && (
                          <Badge variant="secondary" className="text-xs">
                            {doc.tag}
                          </Badge>
                        )}
                        {doc.source === "meal-completion" && doc.date && (
                          <div className="text-xs text-gray-500 mt-1">
                            {formatDate(doc.date)}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col">
                          <span>{shortenFileName(doc.fileName)}</span>
                          {doc.date && doc.source !== 'manual-upload' && (
                            <span className="text-xs text-gray-500 mt-0.5">
                              {doc.date}
                            </span>
                          )}
                          {doc.source === "meal-completion" && doc.notes && (
                            <span className="text-xs text-gray-500 mt-0.5 truncate max-w-50" title={doc.notes}>
                              Note: {doc.notes}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {formatDate(doc.uploadedAt)}
                      </td>
                      <td className="px-3 py-2 text-right flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => viewFile(doc.filePath, doc.fileName)}
                        >
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            downloadFile(doc.filePath, doc.fileName)
                          }
                        >
                          Download
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
