use crate::*;


pub const TOKEN_DELIMETER: char = ':';
pub const TITLE_DELIMETER: &str = " #";
pub const VAULT_FEE: u128 = 500;

const MAX_PRICE: Balance = 1_000_000_000 * 10u128.pow(24);

#[near_bindgen]
impl Contract {
    #[payable]
    pub fn nft_series(
        &mut self,
        token_metadata: TokenMetadata,
        price: Option<U128>,
        perpetual_royalties: Option<HashMap<AccountId, u32>>,
    ) {
        let initial_storage_usage = env::storage_usage();
        let caller_id = env::signer_account_id();

        let token_series_id = format!("{}", (self.token_series_by_id.len() + 1));

        assert!(
            self.token_series_by_id.get(&token_series_id).is_none(),
            "duplicate token_series_id"
        );

        let title = token_metadata.title.clone();
        assert!(title.is_some(), "token_metadata.title is required");
        

        let mut total_perpetual = 0;
        let mut total_accounts = 0;
        let royalty_res: HashMap<AccountId, u32> = if let Some(perpetual_royalties) = perpetual_royalties {
            for (k , v) in perpetual_royalties.iter() {
                if !is_valid_account_id(k.as_bytes()) {
                    env::panic_str("Not valid account_id for royalty");
                };
                total_perpetual += *v;
                total_accounts += 1;
            }
            perpetual_royalties
        } else {
            HashMap::new()
        };

        assert!(total_accounts <= 10, "royalty exceeds 10 accounts");

        assert!(
            total_perpetual <= 9000,
            "Exceeds maximum royalty -> 9000",
        );

        let price_res: Option<u128> = if price.is_some() {
            assert!(
                price.unwrap().0 < MAX_PRICE,
                "price higher than {}",
                MAX_PRICE
            );
            Some(price.unwrap().0)
        } else {
            None
        };

        self.token_series_by_id.insert(&token_series_id, &TokenSeries{
            metadata: token_metadata.clone(),
            creator_id: caller_id.clone(),
            tokens: UnorderedSet::new(
                StorageKey::TokensBySeriesInner {
                    token_series: token_series_id.clone(),
                }
                .try_to_vec()
                .unwrap(),
            ),
            price: price_res,
            is_mintable: true,
            royalty: royalty_res.clone(),
        });

        env::log_str(
            json!({
                "type": "nft_create_series",
                "params": {
                    "token_series_id": token_series_id,
                    "token_metadata": token_metadata,
                    "creator_id": caller_id,
                    "price": price,
                    "perpetual_royalties": royalty_res
                }
            })
            .to_string().as_str(),
        );

        //calculate the required storage which was the used - initial
        let required_storage_in_bytes = env::storage_usage() - initial_storage_usage;

        //refund any excess storage if the user attached too much. Panic if they didn't attach enough to cover the required.
        refund_deposit(required_storage_in_bytes);	
    }


    #[payable]
    pub fn nft_buy(
        &mut self, 
        token_serie_id: TokenSeriesId, 
        receiver_id: AccountId
    ) -> TokenId {

        //measure the initial storage being used on the contract
        let initial_storage_usage = env::storage_usage();

        let token_series = self.token_series_by_id.get(&token_serie_id).expect("Token series not exist");
        let price: u128 = token_series.price.expect("not for sale");
        let attached_deposit = env::attached_deposit();
        assert!(
            attached_deposit >= price,
            "attached deposit is less than price : {}",
            price
        );
        let token_id: TokenId = self._nft_mint_serie(token_serie_id, receiver_id.clone());

        let for_vault = price as u128 * VAULT_FEE / 10_000u128;
        let price_deducted = price - for_vault;
        Promise::new(token_series.creator_id).transfer(price_deducted);
        Promise::new(self.vault_id.clone()).transfer(for_vault);

        //calculate the required storage which was the used - initial
        let required_storage_in_bytes = env::storage_usage() - initial_storage_usage;

        //refund any excess storage if the user attached too much. Panic if they didn't attach enough to cover the required.
        refund_deposit(required_storage_in_bytes);

        NearEvent::log_nft_mint(
            receiver_id.to_string(),
            vec![token_id.clone()],
            Some(json!({"price": price.to_string()}).to_string())
        );

        token_id
    }


    #[payable]
    pub fn nft_mint(
        &mut self, 
        token_serie_id: TokenSeriesId, 
        receiver_id: AccountId
    ) -> TokenId {

        //measure the initial storage being used on the contract
        let initial_storage_usage = env::storage_usage();

        let token_series = self.token_series_by_id.get(&token_serie_id).expect("Token series not exist");
        assert_eq!(env::predecessor_account_id(), token_series.creator_id, "not creator");
        let token_id: TokenId = self._nft_mint_serie(token_serie_id, receiver_id.clone());
        

        NearEvent::log_nft_mint(
            receiver_id.to_string(),
            vec![token_id.clone()],
            None,
        );
        
        //calculate the required storage which was the used - initial
        let required_storage_in_bytes = env::storage_usage() - initial_storage_usage;

        //refund any excess storage if the user attached too much. Panic if they didn't attach enough to cover the required.
        refund_deposit(required_storage_in_bytes);

        token_id
    }

    
    pub fn _nft_mint_serie(
        &mut self,
        token_serie_id: TokenId,
        receiver_id: AccountId,
    ) -> TokenId { 
        let mut token_series = self.token_series_by_id.get(&token_serie_id).expect("Token series not exist");
    
        assert!(
            token_series.is_mintable,
            "Token series is not mintable"
        );

        let num_tokens = token_series.tokens.len();
        let max_copies = token_series.metadata.copies.unwrap_or(u64::MAX);
        assert!(num_tokens < max_copies, "Series supply maxed");

        if (num_tokens + 1) >= max_copies {
            token_series.is_mintable = false;
            token_series.price = None;
        }
        
        let token_id = format!("{}{}{}", &token_serie_id, TOKEN_DELIMETER, num_tokens + 1);
        token_series.tokens.insert(&token_id);
        self.token_series_by_id.insert(&token_serie_id, &token_series);
        let title: String = format!("{} {} {}", token_series.metadata.title.unwrap().clone(), TITLE_DELIMETER, (num_tokens + 1).to_string());
        
        let metadata = Some(TokenMetadata {
            title: Some(title),          
            description: token_series.metadata.description.clone(),   
            media: token_series.metadata.media.clone(),
            media_hash: token_series.metadata.media_hash.clone(), 
            copies: token_series.metadata.copies.clone(), 
            issued_at: Some(env::block_timestamp().to_string()), 
            expires_at: token_series.metadata.expires_at.clone(), 
            starts_at: token_series.metadata.starts_at.clone(), 
            updated_at: token_series.metadata.updated_at.clone(), 
            extra: token_series.metadata.extra.clone(), 
            reference: token_series.metadata.reference.clone(),
            reference_hash: token_series.metadata.reference_hash.clone(), 
        });

        //specify the token struct that contains the owner ID 
        let token = Token {
            //set the owner ID equal to the receiver ID passed into the function
            owner_id: receiver_id,
            //we set the approved account IDs to the default value (an empty map)
            approved_account_ids: Default::default(),
            //the next approval ID is set to 0
            next_approval_id: 0,
            //the map of perpetual royalties for the token (The owner will get 100% - total perpetual royalties)
            royalty: token_series.royalty,
        };

        let token_id: TokenId = format!("{}{}{}", token_serie_id,TOKEN_DELIMETER, token_series.tokens.len()).to_string();

        //insert the token ID and metadata
        self.token_metadata_by_id.insert(&token_id, &metadata.unwrap());

        //call the internal method for adding the token to the owner
        self.internal_add_token_to_owner(&token.owner_id, &token_id);

        token_id

    }

    /*#[payable]
    pub fn nft_mint(
        &mut self,
        token_id: TokenId,
        metadata: TokenMetadata,
        receiver_id: AccountId,
        //we add an optional parameter for perpetual royalties
        perpetual_royalties: Option<HashMap<AccountId, u32>>,
    ) {
        assert!(env::signer_account_id() == self.owner_id, "Only Administrator");
        
        //measure the initial storage being used on the contract
        let initial_storage_usage = env::storage_usage();

        // create a royalty map to store in the token
        let mut royalty = HashMap::new();

        // if perpetual royalties were passed into the function: 
        if let Some(perpetual_royalties) = perpetual_royalties {
            //make sure that the length of the perpetual royalties is below 7 since we won't have enough GAS to pay out that many people
            assert!(perpetual_royalties.len() < 7, "Cannot add more than 6 perpetual royalty amounts");

            //iterate through the perpetual royalties and insert the account and amount in the royalty map
            for (account, amount) in perpetual_royalties {
                royalty.insert(account, amount);
            }
        }

        //specify the token struct that contains the owner ID 
        let token = Token {
            //set the owner ID equal to the receiver ID passed into the function
            owner_id: receiver_id.clone(),
            //we set the approved account IDs to the default value (an empty map)
            approved_account_ids: Default::default(),
            //the next approval ID is set to 0
            next_approval_id: 0,
            //the map of perpetual royalties for the token (The owner will get 100% - total perpetual royalties)
            royalty,
        };

        //insert the token ID and token struct and make sure that the token doesn't exist
        assert!(
            self.tokens_by_id.insert(&token_id, &token).is_none(),
            "Token already exists"
        );

        //insert the token ID and metadata
        self.token_metadata_by_id.insert(&token_id, &metadata);

        //call the internal method for adding the token to the owner
        self.internal_add_token_to_owner(&token.owner_id, &token_id);

        NearEvent::log_nft_mint(
            receiver_id.to_string(),
            vec![token_id.clone()],
            None,
        );
        
        //calculate the required storage which was the used - initial
        let required_storage_in_bytes = env::storage_usage() - initial_storage_usage;

        //refund any excess storage if the user attached too much. Panic if they didn't attach enough to cover the required.
        refund_deposit(required_storage_in_bytes);
    }*/
}