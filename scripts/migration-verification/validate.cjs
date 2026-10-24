const fs=require("fs");
const w=require("schema-wasm-621/src/prisma_schema_build.js");
const schema=fs.readFileSync(process.argv[2],"utf8");
const params=JSON.stringify({prismaSchema:schema,noColor:true});
try{ w.validate(params); console.log("VALIDATE: OK (schema is valid)"); }catch(e){ console.log("VALIDATE: FAILED"); console.log(String(e.message||e)); process.exitCode=1; }
const cfg=JSON.parse(w.get_config(JSON.stringify({prismaSchema:schema,datasourceOverrides:{},ignoreEnvVarErrors:true,env:{}})));
console.log("datasources:",cfg.config.datasources.map(d=>d.provider), "generators:", cfg.config.generators.map(g=>g.provider.value));
const dmmf=JSON.parse(w.get_dmmf(params));
const d=dmmf.datamodel; console.log("models",d.models.length,"enums",d.enums.length);
fs.writeFileSync(process.argv[3],JSON.stringify(dmmf.datamodel,null,1));
