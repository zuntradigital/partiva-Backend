import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../../config/database.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permissions.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/apiError.js";
import { isSafeImageSrc } from "../../utils/articleBlocks.js";

type Review = RowDataPacket & { id:number; name_ar:string; name_en:string|null; role_ar:string; role_en:string|null; quote_ar:string; quote_en:string|null; rating:number; image_src:string|null; display_order:number; active:boolean; created_at:Date; updated_at:Date };
const map=(r:Review)=>({id:r.id,nameAr:r.name_ar,nameEn:r.name_en,roleAr:r.role_ar,roleEn:r.role_en,quoteAr:r.quote_ar,quoteEn:r.quote_en,rating:r.rating,imageSrc:r.image_src,displayOrder:r.display_order,active:Boolean(r.active),createdAt:r.created_at,updatedAt:r.updated_at});
const reviewId=(raw:string)=>{const id=Number(raw);if(!Number.isInteger(id)||id<1)throw new ApiError(422,"VALIDATION_ERROR","Invalid review id");return id;};

const clean=(b:Record<string,unknown>)=>{
  const s=(v:unknown,n:string,needed=true,max=500)=>{
    if(v===undefined||v===null||v===""){if(!needed)return null;throw new ApiError(422,"VALIDATION_ERROR",`${n} is required`)}
    if(typeof v!=="string"||v.length>max)throw new ApiError(422,"VALIDATION_ERROR",`Invalid ${n}`);
    return v.trim();
  };
  const rating=Number(b.rating),order=Number(b.displayOrder);
  if(!Number.isInteger(rating)||rating<1||rating>5)throw new ApiError(422,"VALIDATION_ERROR","rating must be an integer between 1 and 5");
  if(!Number.isInteger(order)||order<0)throw new ApiError(422,"VALIDATION_ERROR","Invalid displayOrder");
  if(typeof b.active!=="boolean")throw new ApiError(422,"VALIDATION_ERROR","Invalid active flag");
  if(b.imageSrc!==undefined&&b.imageSrc!==null&&b.imageSrc!==""&&!isSafeImageSrc(b.imageSrc))throw new ApiError(422,"VALIDATION_ERROR","Invalid image");
  return [
    s(b.nameAr,"nameAr",true,150), s(b.nameEn,"nameEn",false,150),
    s(b.roleAr,"roleAr",true,200), s(b.roleEn,"roleEn",false,200),
    s(b.quoteAr,"quoteAr",true,5000), s(b.quoteEn,"quoteEn",false,5000),
    rating, (b.imageSrc as string|null|undefined)||null,
    order, b.active,
  ];
};

const get=async(id:number)=>{const [r]=await pool.query<Review[]>("SELECT * FROM customer_reviews WHERE id=?",[id]);if(!r[0])throw new ApiError(404,"NOT_FOUND","Review not found");return r[0]};

export const publicReviewsRouter=Router();
publicReviewsRouter.get("/",asyncHandler(async(_req,res)=>{
  const [rows]=await pool.query<Review[]>("SELECT * FROM customer_reviews WHERE active=TRUE ORDER BY display_order,id");
  res.json({success:true,data:rows.map(map)});
}));

export const adminReviewsRouter=Router();
adminReviewsRouter.use(requireAuth);

adminReviewsRouter.get("/",requirePermission("testimonials","view"),asyncHandler(async(_req,res)=>{
  const [rows]=await pool.query<Review[]>("SELECT * FROM customer_reviews ORDER BY display_order,id");
  res.json({success:true,data:rows.map(map)});
}));

adminReviewsRouter.post("/",requirePermission("testimonials","create"),asyncHandler(async(req,res)=>{
  const values=clean(req.body??{});
  const [r]=await pool.query<ResultSetHeader>(
    "INSERT INTO customer_reviews (name_ar,name_en,role_ar,role_en,quote_ar,quote_en,rating,image_src,display_order,active) VALUES (?,?,?,?,?,?,?,?,?,?)",
    values
  );
  res.status(201).json({success:true,data:map(await get(r.insertId))});
}));

adminReviewsRouter.put("/:id",requirePermission("testimonials","edit"),asyncHandler(async(req,res)=>{
  const values=clean(req.body??{}), id=reviewId(String(req.params.id));
  await get(id);
  await pool.query(
    "UPDATE customer_reviews SET name_ar=?,name_en=?,role_ar=?,role_en=?,quote_ar=?,quote_en=?,rating=?,image_src=?,display_order=?,active=? WHERE id=?",
    [...values,id]
  );
  res.json({success:true,data:map(await get(id))});
}));

adminReviewsRouter.delete("/:id",requirePermission("testimonials","delete"),asyncHandler(async(req,res)=>{
  const id=reviewId(String(req.params.id));
  const [r]=await pool.query<ResultSetHeader>("DELETE FROM customer_reviews WHERE id=?",[id]);
  if(!r.affectedRows)throw new ApiError(404,"NOT_FOUND","Review not found");
  res.json({success:true,data:{id}});
}));
