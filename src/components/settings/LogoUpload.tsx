'use client';

import React, { useState, useRef } from 'react';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Upload, Trash2, Loader2, ImageIcon } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface LogoUploadProps {
  currentLogoUrl?: string;
  userId: string;
  onLogoChange: (url: string | null) => void;
}

export function LogoUpload({ currentLogoUrl, userId, onLogoChange }: LogoUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentLogoUrl || null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const validateFile = (file: File): string | null => {
    // Check file type
    if (!file.type.startsWith('image/')) {
      return 'Please select an image file (PNG, JPG, or similar)';
    }

    // Check file size (2MB limit)
    const maxSize = 2 * 1024 * 1024; // 2MB in bytes
    if (file.size > maxSize) {
      return 'File size must be under 2MB';
    }

    return null;
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file
    const error = validateFile(file);
    if (error) {
      toast({
        title: 'Invalid file',
        description: error,
        variant: 'destructive',
      });
      return;
    }

    // Show preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    // Upload to Firebase Storage
    setIsUploading(true);
    try {
      const storage = getStorage();
      const fileExtension = file.name.split('.').pop() || 'png';
      const logoRef = ref(storage, `users/${userId}/logo.${fileExtension}`);

      await uploadBytes(logoRef, file);
      const downloadURL = await getDownloadURL(logoRef);

      // Clean up object URL
      URL.revokeObjectURL(objectUrl);
      setPreviewUrl(downloadURL);
      onLogoChange(downloadURL);

      toast({
        title: 'Success',
        description: 'Logo uploaded successfully',
      });
    } catch (error) {
      console.error('Error uploading logo:', error);
      // Revert preview
      setPreviewUrl(currentLogoUrl || null);
      toast({
        title: 'Upload failed',
        description: 'Failed to upload logo. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async () => {
    setIsUploading(true);
    try {
      // Try to delete from Firebase Storage
      // Note: We don't know the exact extension, so we'll just update Firestore
      // The old file will remain in storage but won't be referenced
      // In a production app, you might want to store the storage path in Firestore
      // and delete it properly

      setPreviewUrl(null);
      onLogoChange(null);

      toast({
        title: 'Success',
        description: 'Logo removed successfully',
      });
    } catch (error) {
      console.error('Error removing logo:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove logo. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      setShowDeleteDialog(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        {/* Preview Area */}
        <div className="flex-shrink-0">
          {previewUrl ? (
            <div className="relative w-[200px] h-[80px] border border-gray-200 rounded-md overflow-hidden bg-white flex items-center justify-center p-2">
              <img
                src={previewUrl}
                alt="Company logo"
                className="max-w-full max-h-full object-contain"
              />
            </div>
          ) : (
            <div className="w-[200px] h-[80px] border-2 border-dashed border-gray-300 rounded-md flex items-center justify-center bg-gray-50">
              <div className="text-center">
                <ImageIcon className="mx-auto h-8 w-8 text-gray-400" />
                <p className="mt-1 text-xs text-gray-500">No logo</p>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex-1 space-y-2">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  {previewUrl ? 'Change Logo' : 'Upload Logo'}
                </>
              )}
            </Button>

            {previewUrl && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
                disabled={isUploading}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remove
              </Button>
            )}
          </div>

          <div className="text-xs text-gray-500 space-y-1">
            <p>Recommended: 400x150px or similar aspect ratio</p>
            <p>Max file size: 2MB • Formats: PNG, JPG, GIF</p>
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove logo?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove your company logo? It will be removed from all future PDF quotes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
